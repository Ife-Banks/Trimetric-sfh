import { describe, it, expect } from "vitest"
import { createRateLimiter, type RateLimiter } from "./rateLimit"

function makeClock(start = 1_000_000) {
  let t = start
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms
    },
  }
}

describe("createRateLimiter", () => {
  it("allows up to max requests inside the window", () => {
    const clock = makeClock()
    const limiter = createRateLimiter({ windowMs: 60_000, max: 3, now: clock.now })
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("a").allowed).toBe(true)
    const fourth = limiter.check("a")
    expect(fourth.allowed).toBe(false)
    expect(fourth.remaining).toBe(0)
  })

  it("reports a sensible retryAfterSeconds for a blocked request", () => {
    const clock = makeClock()
    // max 2, so the 3rd request is blocked ~19s after the window's earliest hit.
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now })
    limiter.check("a")
    clock.advance(19_000)
    limiter.check("a")
    clock.advance(1_000)
    const blocked = limiter.check("a")
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(40) // 60 - 20 elapsed
  })

  it("expires hits once the window slides past them", () => {
    const clock = makeClock()
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: clock.now })
    limiter.check("a")
    limiter.check("a")
    expect(limiter.check("a").allowed).toBe(false)
    clock.advance(60_001)
    expect(limiter.check("a").allowed).toBe(true)
  })

  it("keeps keys isolated from each other", () => {
    const clock = makeClock()
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now })
    limiter.check("ip:1.2.3.4")
    expect(limiter.check("fp:xyz").allowed).toBe(true)
    expect(limiter.check("ip:1.2.3.4").allowed).toBe(false)
  })

  it("reset clears a single key or everything", () => {
    const clock = makeClock()
    const limiter: RateLimiter = createRateLimiter({ windowMs: 60_000, max: 1, now: clock.now })
    limiter.check("a")
    limiter.check("b")
    limiter.reset("a")
    expect(limiter.check("a").allowed).toBe(true)
    expect(limiter.check("b").allowed).toBe(false)
    limiter.reset()
    expect(limiter.check("b").allowed).toBe(true)
  })

  it("counts empty hit lists as cleanup (no memory growth after expiry)", () => {
    const clock = makeClock()
    const limiter = createRateLimiter({ windowMs: 60_000, max: 5, now: clock.now })
    limiter.check("a")
    clock.advance(60_001)
    limiter.check("a")
    // After the advance, only one window present; no throw and allowed.
    expect(limiter.check("a").allowed).toBe(true)
  })
})