import { and, asc, eq, isNull } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { AppDb } from '../db/client'
import { choreCompletions, chores, starLedger } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import { isoUtc } from '@shared/dates'
import { buildRRuleString, parseRRuleString } from '@shared/recurrence/build'
import { expandOccurrences } from '@shared/recurrence/expand'
import type { ChoreCreateInput, ChoreDto, ChoreUpdateInput, DayChoreDto, StarBalanceDto } from '@shared/types'
import { notFound } from './errors'

type ChoreRow = typeof chores.$inferSelect

export function createChoresService(db: AppDb, deviceTz: () => string) {
  function toDto(row: ChoreRow): ChoreDto {
    const zone = deviceTz()
    return {
      id: row.id,
      title: row.title,
      icon: row.icon,
      personId: row.personId!,
      starsValue: row.starsValue,
      recurrence: row.scheduleRrule ? parseRRuleString(row.scheduleRrule, zone) : null,
      anchorDate: row.dueDate ?? DateTime.fromISO(row.createdAt).setZone(zone).toISODate()!,
      routine: row.routine,
      active: row.active,
      sortOrder: row.sortOrder
    }
  }

  function list(): ChoreDto[] | Promise<ChoreDto[]> {
    const res = db
      .select()
      .from(chores)
      .where(isNull(chores.deletedAt))
      .orderBy(asc(chores.sortOrder), asc(chores.createdAt))
      .all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows.map(toDto))
    }
    return res.map(toDto)
  }

  function create(input: ChoreCreateInput): ChoreDto | Promise<ChoreDto> {
    const zone = deviceTz()
    const anchor = input.anchorDate ?? DateTime.now().setZone(zone).toISODate()!
    const id = uuidv7()
    const res = db.insert(chores)
      .values({
        id,
        title: input.title,
        personId: input.personId,
        starsValue: input.starsValue,
        scheduleRrule: input.recurrence ? buildRRuleString(input.recurrence, zone) : null,
        dueDate: anchor,
        routine: input.routine ?? null,
        active: true,
        createdAt: isoUtc(DateTime.utc())
      })
      .run()
    if (res instanceof Promise) {
      return res.then(() => db.select().from(chores).where(eq(chores.id, id)).all()).then(([row]: any[]) => toDto(row))
    }
    const [row] = db.select().from(chores).where(eq(chores.id, id)).all()
    return toDto(row)
  }

  function update(input: ChoreUpdateInput): ChoreDto | Promise<ChoreDto> {
    const zone = deviceTz()
    const patch: Partial<typeof chores.$inferInsert> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.personId !== undefined) patch.personId = input.personId
    if (input.starsValue !== undefined) patch.starsValue = input.starsValue
    if (input.recurrence !== undefined) {
      patch.scheduleRrule = input.recurrence ? buildRRuleString(input.recurrence, zone) : null
    }
    if (input.anchorDate !== undefined) patch.dueDate = input.anchorDate
    if (input.routine !== undefined) patch.routine = input.routine
    if (input.active !== undefined) patch.active = input.active
    const res = db
      .update(chores)
      .set(patch)
      .where(and(eq(chores.id, input.id), isNull(chores.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => db.select().from(chores).where(eq(chores.id, input.id)).all()).then(([row]: any[]) => {
        if (!row) throw notFound('Chore')
        return toDto(row)
      })
    }
    if ((res as any).changes === 0) throw notFound('Chore')
    const [row] = db.select().from(chores).where(eq(chores.id, input.id)).all()
    return toDto(row)
  }

  function remove(id: string): void | Promise<void> {
    const res = db
      .update(chores)
      .set({ deletedAt: isoUtc(DateTime.utc()) })
      .where(and(eq(chores.id, id), isNull(chores.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('Chore')
  }

  function isDueOn(row: ChoreRow, date: string): boolean {
    const zone = deviceTz()
    const anchor = row.dueDate ?? DateTime.fromISO(row.createdAt).setZone(zone).toISODate()!
    if (!row.scheduleRrule) return anchor === date
    if (date < anchor) return false
    const dayStart = DateTime.fromISO(date, { zone }).startOf('day')
    const occurrences = expandOccurrences(
      {
        id: row.id,
        startAt: isoUtc(DateTime.fromISO(anchor, { zone }).startOf('day')),
        endAt: isoUtc(DateTime.fromISO(anchor, { zone }).startOf('day').plus({ days: 1 })),
        tz: zone,
        allDay: true,
        rrule: row.scheduleRrule,
        rdates: null,
        exdates: null
      },
      [],
      isoUtc(dayStart),
      isoUtc(dayStart.plus({ days: 1 }))
    )
    return occurrences.some((o) => DateTime.fromISO(o.start, { zone: 'utc' }).setZone(zone).toISODate() === date)
  }

  function getDay(date: string): DayChoreDto[] | Promise<DayChoreDto[]> {
    const rowsRes = db
      .select()
      .from(chores)
      .where(and(isNull(chores.deletedAt), eq(chores.active, true)))
      .orderBy(asc(chores.sortOrder), asc(chores.createdAt))
      .all()
    if (rowsRes instanceof Promise) {
      return rowsRes.then((rows: any[]) =>
        Promise.resolve(db.select().from(choreCompletions).where(eq(choreCompletions.dueDate, date)).all()).then(
          (completions: any[]) => {
            const done = new Set(completions.map((c) => c.choreId))
            const routineOrder = { morning: 0, null: 1, evening: 2 } as Record<string, number>
            return rows
              .filter((row) => row.personId && isDueOn(row, date))
              .map((row) => ({
                choreId: row.id,
                title: row.title,
                icon: row.icon,
                personId: row.personId!,
                starsValue: row.starsValue,
                routine: row.routine,
                completed: done.has(row.id)
              }))
              .sort((a, b) => routineOrder[String(a.routine)] - routineOrder[String(b.routine)])
          }
        )
      )
    }
    const rows = rowsRes
    const done = new Set(
      (db.select().from(choreCompletions).where(eq(choreCompletions.dueDate, date)).all() as any[]).map((c) => c.choreId)
    )
    const routineOrder = { morning: 0, null: 1, evening: 2 } as Record<string, number>
    return rows
      .filter((row) => row.personId && isDueOn(row, date))
      .map((row) => ({
        choreId: row.id,
        title: row.title,
        icon: row.icon,
        personId: row.personId!,
        starsValue: row.starsValue,
        routine: row.routine,
        completed: done.has(row.id)
      }))
      .sort((a, b) => routineOrder[String(a.routine)] - routineOrder[String(b.routine)])
  }

  function balanceOf(personId: string): number | Promise<number> {
    const res = db.select().from(starLedger).where(eq(starLedger.personId, personId)).all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows.reduce((acc, r) => acc + r.delta, 0))
    }
    return res.reduce((acc, r) => acc + r.delta, 0)
  }

  function balances(): StarBalanceDto[] | Promise<StarBalanceDto[]> {
    const res = db.select().from(starLedger).all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => {
        const totals = new Map<string, number>()
        for (const row of rows) {
          totals.set(row.personId, (totals.get(row.personId) ?? 0) + row.delta)
        }
        return [...totals.entries()].map(([personId, balance]) => ({ personId, balance }))
      })
    }
    const totals = new Map<string, number>()
    for (const row of res) {
      totals.set(row.personId, (totals.get(row.personId) ?? 0) + row.delta)
    }
    return [...totals.entries()].map(([personId, balance]) => ({ personId, balance }))
  }

  function complete(choreId: string, date: string): { balance: number } | Promise<{ balance: number }> {
    const choreRes = db.select().from(chores).where(and(eq(chores.id, choreId), isNull(chores.deletedAt))).all()
    if (choreRes instanceof Promise) {
      return choreRes.then(([chore]: any[]) => {
        if (!chore || !chore.personId) throw notFound('Chore')
        return Promise.resolve(
          db.select().from(choreCompletions).where(and(eq(choreCompletions.choreId, choreId), eq(choreCompletions.dueDate, date))).all()
        ).then(([existing]: any[]) => {
          if (!existing) {
            const completionId = uuidv7()
            const now = isoUtc(DateTime.utc())
            return Promise.resolve(
              db.insert(choreCompletions).values({
                id: completionId,
                choreId,
                personId: chore.personId!,
                dueDate: date,
                completedAt: now,
                starsAwarded: chore.starsValue
              })
            ).then(() => {
              if (chore.starsValue > 0) {
                return db.insert(starLedger).values({
                  id: uuidv7(),
                  personId: chore.personId!,
                  delta: chore.starsValue,
                  reason: 'chore',
                  refId: completionId,
                  createdAt: now
                })
              }
            }).then(() => Promise.resolve(balanceOf(chore.personId))).then((balance) => ({ balance }))
          }
          return Promise.resolve(balanceOf(chore.personId)).then((balance) => ({ balance }))
        })
      })
    }
    const [chore] = choreRes
    if (!chore || !chore.personId) throw notFound('Chore')
    const [existing] = db
      .select()
      .from(choreCompletions)
      .where(and(eq(choreCompletions.choreId, choreId), eq(choreCompletions.dueDate, date)))
      .all()
    if (!existing) {
      const completionId = uuidv7()
      const now = isoUtc(DateTime.utc())
      db.transaction((tx) => {
        tx.insert(choreCompletions)
          .values({
            id: completionId,
            choreId,
            personId: chore.personId!,
            dueDate: date,
            completedAt: now,
            starsAwarded: chore.starsValue
          })
          .run()
        if (chore.starsValue > 0) {
          tx.insert(starLedger)
            .values({
              id: uuidv7(),
              personId: chore.personId!,
              delta: chore.starsValue,
              reason: 'chore',
              refId: completionId,
              createdAt: now
            })
            .run()
        }
      })
    }
    const bal = balanceOf(chore.personId)
    if (bal instanceof Promise) {
      return bal.then((balance) => ({ balance }))
    }
    return { balance: bal }
  }

  function uncomplete(choreId: string, date: string): { balance: number } | Promise<{ balance: number }> {
    const choreRes = db.select().from(chores).where(eq(chores.id, choreId)).all()
    if (choreRes instanceof Promise) {
      return choreRes.then(([chore]: any[]) => {
        if (!chore || !chore.personId) throw notFound('Chore')
        return Promise.resolve(
          db.select().from(choreCompletions).where(and(eq(choreCompletions.choreId, choreId), eq(choreCompletions.dueDate, date))).all()
        ).then(([completion]: any[]) => {
          if (completion) {
            return Promise.resolve(db.delete(starLedger).where(eq(starLedger.refId, completion.id))).then(() =>
              db.delete(choreCompletions).where(eq(choreCompletions.id, completion.id))
            ).then(() => Promise.resolve(balanceOf(chore.personId))).then((balance) => ({ balance }))
          }
          return Promise.resolve(balanceOf(chore.personId)).then((balance) => ({ balance }))
        })
      })
    }
    const [chore] = choreRes
    if (!chore || !chore.personId) throw notFound('Chore')
    const [completion] = db
      .select()
      .from(choreCompletions)
      .where(and(eq(choreCompletions.choreId, choreId), eq(choreCompletions.dueDate, date)))
      .all()
    if (completion) {
      db.transaction((tx) => {
        tx.delete(starLedger).where(eq(starLedger.refId, completion.id)).run()
        tx.delete(choreCompletions).where(eq(choreCompletions.id, completion.id)).run()
      })
    }
    const bal = balanceOf(chore.personId)
    if (bal instanceof Promise) {
      return bal.then((balance) => ({ balance }))
    }
    return { balance: bal }
  }

  return { list, create, update, remove, getDay, complete, uncomplete, balances, balanceOf }
}

export type ChoresService = ReturnType<typeof createChoresService>
