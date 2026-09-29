package billing

import (
	"math"
	"strings"
	"sync"
	"time"
)

// 关键词诱饵：窗口内消息命中关键词的比例影响偷盗与掉落。
//
// 三个消费方（受害者被偷成功率加成、单次偷取金额放大、掉落触发者被跳过）
// 共用一个关键词与严格/宽松匹配开关。统计与掉落计数同款：
// 进程内内存态、重启清零，不落库——群消息量大，逐条写库不划算。
type baitSample struct {
	at  int64
	hit bool
}

// baitKey 个体窗口按 (群, 用户) 隔离：不同群的聊天氛围互不影响
type baitKey struct {
	group string
	user  string
}

type baitSeries struct {
	samples  []baitSample // 按时间有序
	recent   []string     // 最近 dedupWindow 条归一化文本，按用户去重防复读刷占比
	spamUntil int64       // 刷屏惩罚到期 unix 秒，0 = 未惩罚中
	spamCount int64       // 惩罚触发时的窗口内消息数（叠加基数）
}

var (
	baitMu sync.Mutex
	// baitUser 个体窗口；baitGroup 全群窗口。同一条消息要么两边都记、
	// 要么都不记，保证个体占比与全局占比的分母一致。
	baitUser  = make(map[baitKey]*baitSeries)
	baitGroup = make(map[string]*baitSeries)

	baitWrites int // 记录次数计数，达到阈值时触发全量清理
)

const (
	// baitMaxSamples 单系列样本上限：窗口再长、群再活跃也不会无限吃内存
	baitMaxSamples = 20000
	// baitMaxKeys map 里的系列数达到该值时做一次全量过期清理
	baitMaxKeys = 4096
)

// DefaultBaitWindowMinutes 窗口配置缺失或非法时的兜底值
const DefaultBaitWindowMinutes = 30

func baitWindowSeconds() int {
	minutes := GetQQBotSetting().BaitWindowMinutes
	if minutes <= 0 {
		minutes = DefaultBaitWindowMinutes
	}
	return minutes * 60
}

// baitActive 任一效果开启才采样，全关时不白耗锁与内存。
// 刷屏惩罚字段单独看：即使关键词效果全关，刷屏惩罚开启也要记消息数。
func baitActive() bool {
	s := GetQQBotSetting()
	return s.BaitVictimExtraRate > 0 || s.BaitGlobalExtraMultiplier > 0 ||
		s.BaitDropMaxDenyRate > 0 || s.BaitSpamDenyRate > 0 || s.BaitSpamStealRate > 0
}

// isBaitHit 判断一条消息是否命中关键词。
// 严格标签模式：剥 @ 标签与空白后必须一字不差等于关键词；
// 宽松模式：包含即可。双方都转小写，英文关键词也能匹配大小写混写。
func isBaitHit(content, keyword string) bool {
	keyword = strings.ToLower(strings.TrimSpace(keyword))
	if keyword == "" {
		return false
	}
	text := strings.ToLower(strings.TrimSpace(stripTags(content)))
	if GetQQBotSetting().BaitStrictMatch {
		return text == keyword
	}
	return strings.Contains(text, keyword)
}

// HandleGroupChatForBait 采样一条普通群消息，在 HandleGroupAtMessage 的
// default 分支（非指令、非验证码）调用。
// 命中关键词的消息无条件计入（严格模式单字关键词如「杰」过不了
// isMessageCountable 的两字符下限，先判命中保住它），但斜杠指令除外；
// 未命中时复用 isMessageCountable 过滤过短内容，防止刷「1」稀释自己的占比。
func HandleGroupChatForBait(event *GroupAtMessageEvent) {
	if event == nil || event.Author.Bot || !baitActive() {
		return
	}
	if strings.HasPrefix(strings.TrimSpace(stripTags(event.Content)), "/") {
		return
	}
	keyword := GetQQBotSetting().BaitKeyword
	openID := event.Author.MemberOpenID
	if openID == "" {
		openID = event.Author.ID
	}
	if isBaitHit(event.Content, keyword) {
		recordBaitMessage(event.GroupOpenID, openID, event.Content, true)
		return
	}
	if _, ok := isMessageCountable(event.Content); !ok {
		return
	}
	recordBaitMessage(event.GroupOpenID, openID, event.Content, false)
}

// recordBaitMessage 把一条样本记入个体与全群两个系列。
// 同一用户复读同一内容只计一次：刷屏刷占比会让「全局占比→偷得更多」
// 变成小偷可操纵的提款机。复读判定只在个体系列上做——不同用户发
// 相同内容（如集体刷「杰瑞」）是真实的群氛围，全群窗口必须如实计数。
func recordBaitMessage(group, user, raw string, hit bool) {
	normalized, ok := isMessageCountable(raw)
	if !ok {
		if !hit {
			return
		}
		// 严格模式单字关键词等过不了 isMessageCountable 两字符下限的
		// 命中消息，用剥标签后的原文做去重键兜底
		normalized = strings.ToLower(strings.TrimSpace(stripTags(raw)))
	}
	window := int64(baitWindowSeconds())
	now := time.Now().Unix()
	sample := baitSample{at: now, hit: hit}

	baitMu.Lock()
	defer baitMu.Unlock()

	us := baitSeriesFor(baitUser, baitKey{group, user})
	if baitRepeat(us, normalized) {
		return
	}
	pushBaitRecent(us, normalized)
	us.samples = append(us.samples, sample)
	baitTrimSamples(us, now-window)

	gs := baitSeriesFor(baitGroup, group)
	gs.samples = append(gs.samples, sample)
	baitTrimSamples(gs, now-window)

	// 刷屏惩罚：个体系列消息数超阈值时记惩罚截止时间与叠加基数。
	// 每次超阈值都刷新 spamUntil，延长惩罚；spamCount 记触发时的窗口量，
	// 供叠加步长按超阈值倍数累计。
	if th := GetQQBotSetting().BaitSpamThreshold; th > 0 && int64(len(us.samples)) > int64(th) {
		us.spamUntil = now + int64(GetQQBotSetting().BaitSpamPenaltyMinutes)*60
		us.spamCount = int64(len(us.samples))
	}

	baitWrites++
	if baitWrites >= 1024 || len(baitUser)+len(baitGroup) >= baitMaxKeys {
		baitWrites = 0
		pruneBaitMaps(now, window)
	}
}

// baitSeriesFor 取（或建）一个系列
func baitSeriesFor[T comparable](m map[T]*baitSeries, key T) *baitSeries {
	st, ok := m[key]
	if !ok {
		st = &baitSeries{}
		m[key] = st
	}
	return st
}

// baitRepeat 个体系列最近 dedupWindow 条内是否已有同文本
func baitRepeat(st *baitSeries, dedupKey string) bool {
	for _, prev := range st.recent {
		if prev == dedupKey {
			return true
		}
	}
	return false
}

// pushBaitRecent 记录去重键，维持固定窗口长度
func pushBaitRecent(st *baitSeries, dedupKey string) {
	st.recent = append(st.recent, dedupKey)
	if len(st.recent) > dedupWindow {
		st.recent = st.recent[len(st.recent)-dedupWindow:]
	}
}

// baitTrimSamples 从头部删除窗口外的过期样本（时间有序，扫到第一条未过期即停）
func baitTrimSamples(st *baitSeries, cutoff int64) {
	idx := 0
	for idx < len(st.samples) && st.samples[idx].at < cutoff {
		idx++
	}
	if idx > 0 {
		st.samples = st.samples[idx:]
	}
	if len(st.samples) > baitMaxSamples {
		st.samples = st.samples[len(st.samples)-baitMaxSamples:]
	}
}

// pruneBaitMaps 删除窗口内已无样本的系列，防止长期运行后 map 膨胀
func pruneBaitMaps(now, window int64) {
	cutoff := now - window
	for key, st := range baitUser {
		if len(st.samples) == 0 || st.samples[len(st.samples)-1].at < cutoff {
			delete(baitUser, key)
		}
	}
	for key, st := range baitGroup {
		if len(st.samples) == 0 || st.samples[len(st.samples)-1].at < cutoff {
			delete(baitGroup, key)
		}
	}
}

// baitVictimRatio 该用户窗口内命中关键词的消息占比，0..1
func baitVictimRatio(group, user string) float64 {
	baitMu.Lock()
	defer baitMu.Unlock()
	return baitRatioOf(baitUser[baitKey{group, user}])
}

// baitGlobalRatio 全群窗口内命中关键词的消息占比，0..1
func baitGlobalRatio(group string) float64 {
	baitMu.Lock()
	defer baitMu.Unlock()
	return baitRatioOf(baitGroup[group])
}

func baitRatioOf(st *baitSeries) float64 {
	if st == nil || len(st.samples) == 0 {
		return 0
	}
	baitTrimSamples(st, time.Now().Unix()-int64(baitWindowSeconds()))
	if len(st.samples) == 0 {
		return 0
	}
	hits := 0
	for _, s := range st.samples {
		if s.hit {
			hits++
		}
	}
	return float64(hits) / float64(len(st.samples))
}

// ─── 占比 → 效果换算（纯函数，便于单测） ─────────────────────────────────

// baitStealSuccessRate 受害者占比换算成功率：base + round(ratio*extraRate)，
// 钳到 0..100。extraRate <= 0 时原样钳制返回。
func baitStealSuccessRate(base int, victimRatio float64, extraRate int) int {
	rate := float64(base)
	if extraRate > 0 && victimRatio > 0 {
		rate += math.Round(victimRatio * float64(extraRate))
	}
	return clampPercent(rate)
}

// baitScaledAmount 全群占比放大单次偷取金额：round(base*(1+ratio*extra))，
// 上限随倍数同幅放大（否则 extra 设大了也偷不到更多，参数失去意义），
// 下限不低于 minQuota。extra <= 0 或占比为 0 时原样返回。
func baitScaledAmount(base int, globalRatio float64, extraMultiplier float64, minQuota, maxQuota int) int {
	if extraMultiplier <= 0 || globalRatio <= 0 {
		return base
	}
	scaled := math.Round(float64(base) * (1 + globalRatio*extraMultiplier))
	ceiling := float64(maxQuota) * (1 + extraMultiplier)
	return int(math.Max(float64(minQuota), math.Min(scaled, math.Round(ceiling))))
}

// baitDropDenyRate 掉落触发者占比 → 被跳过的概率（百分点），0..100
func baitDropDenyRate(victimRatio float64, maxDenyRate int) int {
	if maxDenyRate <= 0 || victimRatio <= 0 {
		return 0
	}
	return clampPercent(math.Round(victimRatio * float64(maxDenyRate)))
}

// ─── 刷屏惩罚（独立于关键词占比，直接叠加在最终概率上） ────────────────────


// baitSpamPointsFor 查某用户的刷屏惩罚点数（取 deny 与 steal 两者中的最大值，
// 具体哪个生效由调用方按自己关心的维度再做一次拆分）。
// 返回点数；两个独立返回值满足掉落拒发与被偷加成两个维度可分别配置。
func baitSpamPointsFor(group, user string) (denyPts, stealPts int) {
	baitMu.Lock()
	defer baitMu.Unlock()
	st := baitUser[baitKey{group, user}]
	if st == nil || st.spamUntil <= 0 {
		return 0, 0
	}
	now := time.Now().Unix()
	if st.spamUntil <= now {
		return 0, 0
	}
	s := GetQQBotSetting()
	excess := st.spamCount - int64(s.BaitSpamThreshold)
	if excess < 0 {
		excess = 0
	}
	denyPts = clampPercent(float64(s.BaitSpamDenyRate + int(excess)*s.BaitSpamStackStep))
	stealPts = clampPercent(float64(s.BaitSpamStealRate + int(excess)*s.BaitSpamStackStep))
	return denyPts, stealPts
}

func clampPercent(v float64) int {
	return int(math.Max(0, math.Min(100, v)))
}
