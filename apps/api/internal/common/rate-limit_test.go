package common

import (
	"fmt"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestInMemoryRateLimiterConcurrentRequest 是进程崩溃回归测试：限流中间件把
// 每个请求都送进同一个共享的 limiter 实例，Request 此前不带锁读写共享 map，
// 任意两个并发请求即可触发 fatal error: concurrent map writes 杀死整个进程
// （生产 2026-10-01 实际发生，进程靠 restart 策略才被拉起）。
// Go 运行时对并发 map 写入的检测不依赖 -race，未加锁的实现会在本测试下
// 直接 fatal。
func TestInMemoryRateLimiterConcurrentRequest(t *testing.T) {
	limiter := &InMemoryRateLimiter{}
	limiter.Init(0) // expiration 0：测试内不启动过期清理 goroutine

	const goroutines = 50
	const iterations = 200
	var wg sync.WaitGroup
	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := 0; i < iterations; i++ {
				assert.True(t, limiter.Request(fmt.Sprintf("key-%d", i%16), 1_000_000, 60))
			}
		}()
	}
	wg.Wait()

	limiter.mutex.Lock()
	assert.Len(t, limiter.store, 16)
	limiter.mutex.Unlock()
}

// TestInMemoryRateLimiterWindowSemantics 钉住限流的对外契约：固定窗口内放行
// 前 N 个请求，超出预算即拒绝。加锁不得改变这段行为。
func TestInMemoryRateLimiterWindowSemantics(t *testing.T) {
	limiter := &InMemoryRateLimiter{}
	limiter.Init(0)

	for i := 0; i < 3; i++ {
		require.True(t, limiter.Request("key", 3, 60), "窗口预算内的请求必须放行")
	}
	assert.False(t, limiter.Request("key", 3, 60), "超出窗口预算的请求必须拒绝")
}
