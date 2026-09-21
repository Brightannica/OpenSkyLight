import { and, asc, eq, isNull } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { AppDb } from '../db/client'
import { calendars, events } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import { isoUtc } from '@shared/dates'
import type { CalendarCreateInput, CalendarDto, CalendarUpdateInput } from '@shared/types'
import { invalid, notFound } from './errors'

function toDto(row: typeof calendars.$inferSelect): CalendarDto {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    color: row.color,
    readOnly: row.readOnly,
    visible: row.visible
  }
}

export function createCalendarService(db: AppDb) {
  function list(): CalendarDto[] | Promise<CalendarDto[]> {
    const res = db
      .select()
      .from(calendars)
      .where(isNull(calendars.deletedAt))
      .orderBy(asc(calendars.name))
      .all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows.map(toDto))
    }
    return res.map(toDto)
  }

  function create(input: CalendarCreateInput): CalendarDto | Promise<CalendarDto> {
    const row: typeof calendars.$inferInsert = {
      id: uuidv7(),
      provider: 'local',
      name: input.name,
      color: input.color,
      readOnly: false,
      visible: true
    }
    const res = db.insert(calendars).values(row).run()
    if (res instanceof Promise) {
      return res.then(() =>
        db.select().from(calendars).where(eq(calendars.id, row.id!)).all()
      ).then(([created]: any[]) => toDto(created))
    }
    const [created] = db.select().from(calendars).where(eq(calendars.id, row.id!)).all()
    return toDto(created)
  }

  function update(input: CalendarUpdateInput): CalendarDto | Promise<CalendarDto> {
    const patch: Partial<typeof calendars.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.color !== undefined) patch.color = input.color
    if (input.visible !== undefined) patch.visible = input.visible
    const res = db
      .update(calendars)
      .set(patch)
      .where(and(eq(calendars.id, input.id), isNull(calendars.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() =>
        db.select().from(calendars).where(eq(calendars.id, input.id)).all()
      ).then(([row]: any[]) => {
        if (!row) throw notFound('Calendar')
        return toDto(row)
      })
    }
    if ((res as any).changes === 0) throw notFound('Calendar')
    const [row] = db.select().from(calendars).where(eq(calendars.id, input.id)).all()
    return toDto(row)
  }

  function remove(id: string): void | Promise<void> {
    const visibleRes = db
      .select()
      .from(calendars)
      .where(and(isNull(calendars.deletedAt)))
      .all()
    if (visibleRes instanceof Promise) {
      return visibleRes.then((visible: any[]) => {
        if (visible.length <= 1) throw invalid('Cannot delete the last calendar')
        const now = isoUtc(DateTime.utc())
        return db.update(calendars).set({ deletedAt: now }).where(and(eq(calendars.id, id), isNull(calendars.deletedAt))).then(() => {
          return db.update(events).set({ deletedAt: now }).where(and(eq(events.calendarId, id), isNull(events.deletedAt)))
        }).then(() => {})
      })
    }
    if (visibleRes.length <= 1) throw invalid('Cannot delete the last calendar')
    const now = isoUtc(DateTime.utc())
    db.transaction((tx) => {
      const result = tx
        .update(calendars)
        .set({ deletedAt: now })
        .where(and(eq(calendars.id, id), isNull(calendars.deletedAt)))
        .run()
      if (result.changes === 0) throw notFound('Calendar')
      tx.update(events).set({ deletedAt: now }).where(and(eq(events.calendarId, id), isNull(events.deletedAt))).run()
    })
  }

  return { list, create, update, remove }
}

export type CalendarService = ReturnType<typeof createCalendarService>
