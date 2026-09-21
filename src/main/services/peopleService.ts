import { and, asc, eq, isNull, max } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { AppDb } from '../db/client'
import { people } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import { isoUtc } from '@shared/dates'
import type { PersonCreateInput, PersonDto, PersonUpdateInput } from '@shared/types'
import { notFound } from './errors'

function toDto(row: typeof people.$inferSelect): PersonDto {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    role: row.role,
    sortOrder: row.sortOrder
  }
}

export function createPeopleService(db: AppDb) {
  function list(): PersonDto[] | Promise<PersonDto[]> {
    const res = db
      .select()
      .from(people)
      .where(isNull(people.deletedAt))
      .orderBy(asc(people.sortOrder), asc(people.createdAt))
      .all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows.map(toDto))
    }
    return res.map(toDto)
  }

  function create(input: PersonCreateInput): PersonDto | Promise<PersonDto> {
    const maxRes = db.select({ value: max(people.sortOrder) }).from(people).all()
    if (maxRes instanceof Promise) {
      return maxRes.then(([{ value: maxSort }]: any[]) => {
        const row: typeof people.$inferInsert = {
          id: uuidv7(),
          name: input.name,
          color: input.color,
          role: input.role,
          sortOrder: (maxSort ?? 0) + 1,
          createdAt: isoUtc(DateTime.utc())
        }
        return Promise.resolve(db.insert(people).values(row)).then(() =>
          toDto({ ...row, avatarPath: null, deletedAt: null, sortOrder: row.sortOrder! } as typeof people.$inferSelect)
        )
      })
    }
    const [{ value: maxSort }] = maxRes
    const row: typeof people.$inferInsert = {
      id: uuidv7(),
      name: input.name,
      color: input.color,
      role: input.role,
      sortOrder: (maxSort ?? 0) + 1,
      createdAt: isoUtc(DateTime.utc())
    }
    db.insert(people).values(row).run()
    return toDto({ ...row, avatarPath: null, deletedAt: null, sortOrder: row.sortOrder! } as typeof people.$inferSelect)
  }

  function update(input: PersonUpdateInput): PersonDto | Promise<PersonDto> {
    const patch: Partial<typeof people.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.color !== undefined) patch.color = input.color
    if (input.role !== undefined) patch.role = input.role
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder
    const res = db
      .update(people)
      .set(patch)
      .where(and(eq(people.id, input.id), isNull(people.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() =>
        db.select().from(people).where(eq(people.id, input.id)).all()
      ).then(([row]: any[]) => {
        if (!row) throw notFound('Person')
        return toDto(row)
      })
    }
    if ((res as any).changes === 0) throw notFound('Person')
    const [row] = db.select().from(people).where(eq(people.id, input.id)).all()
    return toDto(row)
  }

  function remove(id: string): void | Promise<void> {
    const res = db
      .update(people)
      .set({ deletedAt: isoUtc(DateTime.utc()) })
      .where(and(eq(people.id, id), isNull(people.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('Person')
  }

  return { list, create, update, remove }
}

export type PeopleService = ReturnType<typeof createPeopleService>
