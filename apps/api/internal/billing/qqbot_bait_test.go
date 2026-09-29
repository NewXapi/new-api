package billing

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/internal/common/dbx"
	"github.com/QuantumNous/new-api/internal/identity"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setBaitSetting 快照 qq_bot_setting，测试结束后恢复
func setBaitSetting(t *testing.T, mutate func(s *QQBotSetting)) {
	t.Helper()
	s := GetQQBotSetting()
	orig := *s
	t.Cleanup(func() { *s = orig })
	mutate(s)
}

// resetBaitState 清空诱饵统计，避免用例间共享全局状态
func resetBaitState() {
	baitUser = make(map[baitKey]*baitSeries)
	baitGroup = make(map[string]*baitSeries)
	baitWrites = 0
}

func baitEvent(group, user, content string, bot bool) *GroupAtMessageEvent {
	e := &GroupAtMessageEvent{Content: content, GroupOpenID: group}
	e.Author.ID = user
	e.Author.Bot = bot
	return e
}

// TestIsBaitHit 严格标签模式一字不差，宽松模式包含即命中
func TestIsBaitHit(t *testing.T) {
	setBaitSetting(t, func(s *QQBotSetting) { s.BaitKeyword = "杰瑞" })

	t.Run("宽松包含匹配", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) { s.BaitStrictMatch = false })
		cases := []struct {
			content string
			want    bool
		}{
			{"杰瑞", true},
			{"我说杰瑞啦", true},
			{"今天聊聊<qqbot-at-user id=\"b\" />杰瑞吧", true},
			{"杰", false},
			{"", false},
		}
		for _, c := range cases {
			assert.Equal(t, c.want, isBaitHit(c.content, "杰瑞"), c.content)
		}
	})

	t.Run("严格一字不差", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) { s.BaitStrictMatch = true })
		cases := []struct {
			content string
			want    bool
		}{
			{"杰瑞", true},
			{"  杰瑞  ", true},
			{"<qqbot-at-user id=\"b\" />杰瑞", true},
			{"我杰瑞", false},
			{"杰瑞了", false},
			{"杰", false},
		}
		for _, c := range cases {
			assert.Equal(t, c.want, isBaitHit(c.content, "杰瑞"), c.content)
		}
	})

	t.Run("英文关键词大小写不敏感", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) { s.BaitKeyword = "jerry"; s.BaitStrictMatch = false })
		assert.True(t, isBaitHit("Say Jerry!", "jerry"))
	})

	t.Run("空关键词永不命中", func(t *testing.T) {
		assert.False(t, isBaitHit("杰瑞", ""))
	})
}

// TestRecordBaitAndRatios 占比计算、个体与全群分母一致、复读去重、窗口过期
func TestRecordBaitAndRatios(t *testing.T) {
	setBaitSetting(t, func(s *QQBotSetting) { s.BaitWindowMinutes = 30 })

	t.Run("占比与分母一致", func(t *testing.T) {
		resetBaitState()
		recordBaitMessage("g1", "u1", "我看见了杰瑞", true)
		recordBaitMessage("g1", "u1", "今天天气不错", false)
		recordBaitMessage("g1", "u1", "杰瑞又跑了", true)

		assert.InDelta(t, 2.0/3.0, baitVictimRatio("g1", "u1"), 1e-9)
		assert.InDelta(t, 2.0/3.0, baitGlobalRatio("g1"), 1e-9, "个体与全群分母一致")
		assert.Equal(t, 0.0, baitVictimRatio("g1", "u2"))
		assert.Equal(t, 0.0, baitGlobalRatio("g-other"))
	})

	t.Run("复读只计一次", func(t *testing.T) {
		resetBaitState()
		for i := 0; i < 5; i++ {
			recordBaitMessage("g", "u", "杰瑞杰瑞", true)
		}
		assert.Equal(t, 1.0, baitVictimRatio("g", "u"), "同用户复读只记 1 条")
		assert.Equal(t, 1.0, baitGlobalRatio("g"))
	})

	t.Run("不同用户发相同内容全群如实计数", func(t *testing.T) {
		resetBaitState()
		recordBaitMessage("g", "u1", "杰瑞", true)
		recordBaitMessage("g", "u2", "杰瑞", true)
		assert.Equal(t, 1.0, baitGlobalRatio("g"), "两个人都发杰瑞应计 2 条 hit")
	})

	t.Run("窗口外样本过期", func(t *testing.T) {
		resetBaitState()
		recordBaitMessage("g", "u", "aaa", false)
		recordBaitMessage("g", "u", "杰瑞来了", true)

		stale := time.Now().Unix() - int64(baitWindowSeconds()) - 10
		baitUser[baitKey{"g", "u"}].samples[0].at = stale
		baitGroup["g"].samples[0].at = stale

		assert.Equal(t, 1.0, baitVictimRatio("g", "u"), "过期的 miss 不再计入")
		assert.Equal(t, 1.0, baitGlobalRatio("g"))
	})
}

// TestBaitStealSuccessRate 受害者占比线性加成成功率并钳制
func TestBaitStealSuccessRate(t *testing.T) {
	assert.Equal(t, 50, baitStealSuccessRate(50, 0, 50), "占比 0 不加成")
	assert.Equal(t, 75, baitStealSuccessRate(50, 0.5, 50))
	assert.Equal(t, 100, baitStealSuccessRate(50, 1, 50))
	assert.Equal(t, 100, baitStealSuccessRate(90, 1, 50), "钳到 100")
	assert.Equal(t, 25, baitStealSuccessRate(0, 0.5, 50))
	assert.Equal(t, 50, baitStealSuccessRate(50, 1, 0), "加成为 0 时关闭")
	assert.Equal(t, 50, baitStealSuccessRate(50, 1, -1))
}

// TestBaitScaledAmount 全群占比线性放大偷取金额，上限随倍数同幅放大
func TestBaitScaledAmount(t *testing.T) {
	assert.Equal(t, 100, baitScaledAmount(100, 0, 1, 10, 100), "占比 0 原样")
	assert.Equal(t, 150, baitScaledAmount(100, 0.5, 1, 10, 100))
	assert.Equal(t, 200, baitScaledAmount(100, 1, 1, 10, 100), "100% 时翻倍")
	assert.Equal(t, 200, baitScaledAmount(150, 1, 1, 10, 100), "上限随倍数放大到 200")
	assert.Equal(t, 100, baitScaledAmount(100, 1, 0, 10, 100), "倍数为 0 时关闭")
	assert.Equal(t, 50, baitScaledAmount(20, 1, 0.1, 50, 100), "不低于单次下限")
}

// TestBaitDropDenyRate 掉落拒发概率按占比缩放并钳制
func TestBaitDropDenyRate(t *testing.T) {
	assert.Equal(t, 0, baitDropDenyRate(0, 100))
	assert.Equal(t, 25, baitDropDenyRate(0.5, 50))
	assert.Equal(t, 100, baitDropDenyRate(1, 100))
	assert.Equal(t, 100, baitDropDenyRate(1.5, 100), "钳到 100")
	assert.Equal(t, 0, baitDropDenyRate(1, 0), "上限为 0 时关闭")
	assert.Equal(t, 0, baitDropDenyRate(1, -5))
}

// TestHandleGroupChatForBait 事件入口：命中/未命中采样、Bot 与指令不采样、严格模式
func TestHandleGroupChatForBait(t *testing.T) {
	t.Run("宽松采样", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) {
			s.BaitKeyword = "杰瑞"
			s.BaitStrictMatch = false
			s.BaitVictimExtraRate = 50
		})
		resetBaitState()

		HandleGroupChatForBait(baitEvent("g", "u", "<qqbot-at-user id=\"b\" /> 今天聊聊杰瑞吧", false))
		HandleGroupChatForBait(baitEvent("g", "u", "今天天气不错", false))
		assert.InDelta(t, 0.5, baitVictimRatio("g", "u"), 1e-9)
		assert.InDelta(t, 0.5, baitGlobalRatio("g"), 1e-9)
	})

	t.Run("Bot 消息与指令不采样", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) {
			s.BaitKeyword = "杰瑞"
			s.BaitVictimExtraRate = 50
		})
		resetBaitState()

		HandleGroupChatForBait(baitEvent("g", "u", "杰瑞", true))
		HandleGroupChatForBait(baitEvent("g", "u", "/签到 杰瑞", false))
		assert.Equal(t, 0.0, baitVictimRatio("g", "u"))
		assert.Equal(t, 0.0, baitGlobalRatio("g"))
	})

	t.Run("严格模式过滤带字消息", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) {
			s.BaitKeyword = "杰瑞"
			s.BaitStrictMatch = true
			s.BaitVictimExtraRate = 50
		})
		resetBaitState()

		HandleGroupChatForBait(baitEvent("g", "u", "我说杰瑞", false))
		HandleGroupChatForBait(baitEvent("g", "u", "杰瑞", false))
		assert.InDelta(t, 0.5, baitVictimRatio("g", "u"), 1e-9,
			"未命中的有效聊天进分母，只有一字不差的杰瑞算 hit")
	})

	t.Run("全部效果关闭时不采样", func(t *testing.T) {
		setBaitSetting(t, func(s *QQBotSetting) {
			s.BaitKeyword = "杰瑞"
			s.BaitVictimExtraRate = 0
			s.BaitGlobalExtraMultiplier = 0
			s.BaitDropMaxDenyRate = 0
		})
		resetBaitState()

		HandleGroupChatForBait(baitEvent("g", "u", "杰瑞", false))
		assert.Equal(t, 0.0, baitVictimRatio("g", "u"))
		assert.Equal(t, 0.0, baitGlobalRatio("g"))
	})
}

// TestHandleGroupChatForDrop_BaitDeny 掉落触发者命中占比 1 且拒发率 100% 时
// 掉落顺延给下一位：不发放、计数保留；占比 0 时正常发放。
func TestHandleGroupChatForDrop_BaitDeny(t *testing.T) {
	defer setupStealTestDB(t)()
	require.NoError(t, dbx.DB.AutoMigrate(&QQDrop{}))

	setBaitSetting(t, func(s *QQBotSetting) {
		s.DropEnabled = true
		s.DropGroups = "g-drop"
		s.DropMinMessages = 1
		s.DropMaxMessages = 1
		s.DropMinQuota = 100
		s.DropMaxQuota = 100
		s.DropDailyLimit = 3
		s.BaitKeyword = "杰瑞"
		s.BaitDropMaxDenyRate = 100
	})

	userId := createQuotaUser(t, "drop-bait-user", 1000000)
	require.NoError(t, dbx.DB.Create(&identity.QQBinding{
		UserId:    userId,
		OpenID:    "bait-drop-open",
		CreatedAt: time.Now().Unix(),
	}).Error)

	t.Run("占比 1 拒发率 100 顺延", func(t *testing.T) {
		resetBaitState()
		dropStates = make(map[string]*groupDropState)
		recordBaitMessage("g-drop", "bait-drop-open", "我爱杰瑞", true)

		HandleGroupChatForDrop(baitEvent("g-drop", "bait-drop-open", "我爱杰瑞", false))

		assert.Equal(t, 1, dropStates["g-drop"].count, "计数保留，掉落顺延给下一位")
		var cnt int64
		require.NoError(t, dbx.DB.Model(&QQDrop{}).Count(&cnt).Error)
		assert.Equal(t, int64(0), cnt, "不该发放任何掉落")
	})

	t.Run("占比 0 正常发放", func(t *testing.T) {
		resetBaitState()
		dropStates = make(map[string]*groupDropState)

		HandleGroupChatForDrop(baitEvent("g-drop", "bait-drop-open", "今天天气不错", false))

		assert.Equal(t, 0, dropStates["g-drop"].count, "发放成功后计数重置")
		var cnt int64
		require.NoError(t, dbx.DB.Model(&QQDrop{}).Count(&cnt).Error)
		assert.Equal(t, int64(1), cnt, "正常发放一条掉落")
	})
}
