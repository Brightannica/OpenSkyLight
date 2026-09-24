import { eq } from 'drizzle-orm'
import type { AppDb } from '../db/client'
import { settings } from '../db/schema'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

export function createSettingsService(db: AppDb) {
  let cachedSettings: AppSettings | null = null
  let settingsPromise: Promise<AppSettings> | null = null
  let cachedRaw: Map<string, string | null> = new Map()

  function parseSettingsRows(rows: any[]): AppSettings {
    const stored: Record<string, unknown> = {}
    const known = new Set(Object.keys(DEFAULT_SETTINGS))
    for (const row of rows) {
      if (!known.has(row.key)) continue
      try {
        stored[row.key] = JSON.parse(row.value)
      } catch {
        // ignore
      }
    }
    return { ...DEFAULT_SETTINGS, ...stored } as AppSettings
  }

  async function getAll(): Promise<AppSettings> {
    if (cachedSettings) return cachedSettings
    if (settingsPromise) return settingsPromise
    settingsPromise = (async () => {
      const res = await db.select().from(settings).all()
      cachedSettings = parseSettingsRows(res)
      settingsPromise = null
      return cachedSettings
    })()
    return settingsPromise
  }

  function getAllSync(): AppSettings {
    if (!cachedSettings) {
      const res = db.select().from(settings).all()
      if (res instanceof Promise) {
        return DEFAULT_SETTINGS // fallback if async - shouldn't happen for sqlite
      }
      cachedSettings = parseSettingsRows(res)
    }
    return cachedSettings
  }

  async function getRaw(key: string): Promise<string | null> {
    if (cachedRaw.has(key)) return cachedRaw.get(key) ?? null
    const res = await db.select().from(settings).where(eq(settings.key, key)).all()
    const value = res[0]?.value ?? null
    cachedRaw.set(key, value)
    return value
  }

  function getRawSync(key: string): string | null {
    if (cachedRaw.has(key)) return cachedRaw.get(key) ?? null
    const res = db.select().from(settings).where(eq(settings.key, key)).all()
    if (res instanceof Promise) {
      return null // fallback if async
    }
    const value = res[0]?.value ?? null
    cachedRaw.set(key, value)
    return value
  }

  async function setRaw(key: string, value: string): Promise<void> {
    const existing = await db.select().from(settings).where(eq(settings.key, key)).all()
    if (existing.length > 0) {
      await db.update(settings).set({ value }).where(eq(settings.key, key)).run()
    } else {
      await db.insert(settings).values({ key, value }).run()
    }
    cachedRaw.set(key, value)
  }

  function setRawSync(key: string, value: string): void {
    const existing = db.select().from(settings).where(eq(settings.key, key)).all()
    if (existing instanceof Promise) {
      // For async drivers, we can't do sync - this should be rare for sqlite
      return
    }
    if (existing.length > 0) {
      db.update(settings).set({ value }).where(eq(settings.key, key)).run()
    } else {
      db.insert(settings).values({ key, value }).run()
    }
    cachedRaw.set(key, value)
  }

  async function deleteRaw(key: string): Promise<void> {
    await db.delete(settings).where(eq(settings.key, key)).run()
    cachedRaw.delete(key)
  }

  function deleteRawSync(key: string): void {
    const res = db.delete(settings).where(eq(settings.key, key)).run()
    if (res instanceof Promise) {
      return
    }
    cachedRaw.delete(key)
  }

  async function set(patch: Partial<AppSettings>): Promise<AppSettings> {
    const promises: Promise<any>[] = []
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      const json = JSON.stringify(value)
      const existing = await db.select().from(settings).where(eq(settings.key, key)).all()
      if (existing.length > 0) {
        promises.push(db.update(settings).set({ value: json }).where(eq(settings.key, key)).run())
      } else {
        promises.push(db.insert(settings).values({ key, value: json }).run())
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises)
    }
    cachedSettings = null // invalidate cache
    return getAll()
  }

  return { getAll, getAllSync, set, getRaw, getRawSync, setRaw, setRawSync, deleteRaw, deleteRawSync }
}

export type SettingsService = ReturnType<typeof createSettingsService>
