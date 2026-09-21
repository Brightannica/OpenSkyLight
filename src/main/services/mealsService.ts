import { and, eq, gte, lte } from 'drizzle-orm'
import type { AppDb } from '../db/client'
import { mealSlots } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import type { MealSlotDto, MealSlotKind } from '@shared/types'

export function createMealsService(db: AppDb) {
  /** Inclusive date range of meal entries. */
  function getRange(start: string, end: string): MealSlotDto[] | Promise<MealSlotDto[]> {
    const res = db
      .select()
      .from(mealSlots)
      .where(and(gte(mealSlots.date, start), lte(mealSlots.date, end)))
      .all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) =>
        rows.filter((r) => (r.freeText ?? '').length > 0).map((r) => ({ date: r.date, slot: r.slot, text: r.freeText! }))
      )
    }
    return res
      .filter((r) => (r.freeText ?? '').length > 0)
      .map((r) => ({ date: r.date, slot: r.slot, text: r.freeText! }))
  }

  function set(date: string, slot: MealSlotKind, text: string | null): void | Promise<void> {
    const existingRes = db
      .select()
      .from(mealSlots)
      .where(and(eq(mealSlots.date, date), eq(mealSlots.slot, slot)))
      .all()
    if (existingRes instanceof Promise) {
      return existingRes.then(([existing]: any[]) => {
        if (text === null || text.trim() === '') {
          if (existing) return db.delete(mealSlots).where(eq(mealSlots.id, existing.id))
          return
        }
        if (existing) {
          return db.update(mealSlots).set({ freeText: text.trim() }).where(eq(mealSlots.id, existing.id))
        } else {
          return db.insert(mealSlots).values({ id: uuidv7(), date, slot, freeText: text.trim() })
        }
      })
    }
    const [existing] = existingRes
    if (text === null || text.trim() === '') {
      if (existing) db.delete(mealSlots).where(eq(mealSlots.id, existing.id)).run()
      return
    }
    if (existing) {
      db.update(mealSlots).set({ freeText: text.trim() }).where(eq(mealSlots.id, existing.id)).run()
    } else {
      db.insert(mealSlots).values({ id: uuidv7(), date, slot, freeText: text.trim() }).run()
    }
  }

  return { getRange, set }
}

export type MealsService = ReturnType<typeof createMealsService>
