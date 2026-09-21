import { eq } from 'drizzle-orm'
import type { AppDb } from '../db/client'
import { settings } from '../db/schema'
import { DEFAULT_SETTINGS, type AppSettings } from '@shared/types'

export function createSettingsService(db: AppDb) {
  function getAll(): AppSettings | Promise<AppSettings> {
    const res = db.select().from(settings).all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => parseSettingsRows(rows))
    }
    return parseSettingsRows(res)
  }

  function getRaw(key: string): string | null | Promise<string | null> {
    const res = db.select().from(settings).where(eq(settings.key, key)).all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows[0]?.value ?? null)
    }
    return res[0]?.value ?? null
  }

  function setRaw(key: string, value: string): void | Promise<void> {
    const existing = db.select().from(settings).where(eq(settings.key, key)).all()
    if (existing instanceof Promise) {
      return existing.then((rows: any[]) => {
        if (rows.length > 0) return db.update(settings).set({ value }).where(eq(settings.key, key))
        return db.insert(settings).values({ key, value })
      })
    }
    if (existing.length > 0) db.update(settings).set({ value }).where(eq(settings.key, key)).run()
    else db.insert(settings).values({ key, value }).run()
  }

  function deleteRaw(key: string): void | Promise<void> {
    const res = db.delete(settings).where(eq(settings.key, key)).run()
    if (res instanceof Promise) return res.then(() => {})
  }

  function set(patch: Partial<AppSettings>): AppSettings | Promise<AppSettings> {
    const promises: Promise<any>[] = []
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      const json = JSON.stringify(value)
      const existing = db.select().from(settings).where(eq(settings.key, key)).all()
      if (existing instanceof Promise) {
        promises.push(
          existing.then((rows: any[]) => {
            if (rows.length > 0) return db.update(settings).set({ value: json }).where(eq(settings.key, key))
            return db.insert(settings).values({ key, value: json })
          })
        )
      } else {
        if (existing.length > 0) {
          db.update(settings).set({ value: json }).where(eq(settings.key, key)).run()
        } else {
          db.insert(settings).values({ key, value: json }).run()
        }
      }
    }
    if (promises.length > 0) {
      return Promise.all(promises).then(() => getAll())
    }
    return getAll()
  }

  return { getAll, set, getRaw, setRaw, deleteRaw }
}

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

export type SettingsService = ReturnType<typeof createSettingsService>
