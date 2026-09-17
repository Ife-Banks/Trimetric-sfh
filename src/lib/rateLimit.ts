// Sliding-window rate limiter. Pure and deterministic with an injectable clock
// so the unit tests don't have to wait real time. Uses a per-key FIFO of
// timestamps; expired entries are pruned on each check.

export interface RateLimitState {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export interface RateLimiterOptions {
  windowMs: number
  max: number
  now?: () => number
}

export interface RateLimiter {
  check: (key: string) => RateLimitState
  reset: (key?: string) => void
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const { windowMs, max, now = () => Date.now() } = options
  const hits = new Map<string, number[]>()

  function prune(key: string, at: number): number[] {
    const cutoff = at - windowMs
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff)
    if (list.length === 0) hits.delete(key)
    else hits.set(key, list)
    return list
  }

  return {
    check(key: string): RateLimitState {
      const at = now()
      const list = prune(key, at)
      if (list.length < max) {
        list.push(at)
        hits.set(key, list)
        return { allowed: true, remaining: max - list.length, retryAfterSeconds: 0 }
      }
      const oldest = list[0]
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - at) / 1000)),
      }
    },

    reset(key?: string) {
      if (key === undefined) hits.clear()
      else hits.delete(key)
    },
  }
}