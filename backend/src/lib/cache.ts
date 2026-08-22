import Redis from "ioredis"

type MemoryEntry = {
  value: string
  expiresAt: number
}

const memoryCache = new Map<string, MemoryEntry>()
const MAX_MEMORY_KEYS = 5000
let redisClient: any = null

// Periodic sweep to actively purge expired keys from memory every 60s
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now()
    for (const [k, v] of memoryCache.entries()) {
      if (v.expiresAt < now) {
        memoryCache.delete(k)
      }
    }
  }, 60_000).unref?.()
}

if (process.env.REDIS_URL) {
  try {
    // @ts-ignore
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    })
    redisClient.on("error", (err: any) => console.warn("[Redis] Cache disabled:", err.message))
  } catch (err) {
    console.warn("[Redis] Could not connect:", err)
  }
}

function getRedis(): any {
  return redisClient
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis()

  if (client) {
    const raw = await client.get(key)
    return raw ? JSON.parse(raw) as T : null
  }

  const entry = memoryCache.get(key)
  if (!entry || entry.expiresAt < Date.now()) {
    memoryCache.delete(key)
    return null
  }

  return JSON.parse(entry.value) as T
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const raw = JSON.stringify(value)
  const client = getRedis()

  if (client) {
    await client.set(key, raw, "EX", ttlSeconds)
    return
  }

  memoryCache.set(key, {
    value: raw,
    expiresAt: Date.now() + ttlSeconds * 1000,
  })
}

export async function cacheDel(key: string): Promise<void> {
  const client = getRedis()
  if (client) await client.del(key)
  memoryCache.delete(key)
}
