import { and, asc, eq, isNull, max } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { AppDb } from '../db/client'
import { listItems, lists } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import { isoUtc } from '@shared/dates'
import type { ListDto, ListItemDto, ListKind } from '@shared/types'
import { notFound } from './errors'

function itemDto(row: typeof listItems.$inferSelect): ListItemDto {
  return { id: row.id, text: row.text, checked: row.checked, sortOrder: row.sortOrder }
}

export function createListsService(db: AppDb) {
  function getAll(): ListDto[] | Promise<ListDto[]> {
    const listRowsRes = db
      .select()
      .from(lists)
      .where(isNull(lists.deletedAt))
      .orderBy(asc(lists.sortOrder), asc(lists.name))
      .all()
    if (listRowsRes instanceof Promise) {
      return listRowsRes.then((listRows: any[]) => {
        if (listRows.length === 0) return []
        return Promise.resolve(db.select().from(listItems).orderBy(asc(listItems.sortOrder), asc(listItems.createdAt)).all()).then(
          (itemRows: any[]) => {
            const byList = new Map<string, ListItemDto[]>()
            for (const item of itemRows) {
              const arr = byList.get(item.listId) ?? []
              arr.push(itemDto(item))
              byList.set(item.listId, arr)
            }
            return listRows.map((l) => {
              const items = byList.get(l.id) ?? []
              items.sort((a, b) => Number(a.checked) - Number(b.checked))
              return { id: l.id, name: l.name, color: l.color, kind: l.kind, items }
            })
          }
        )
      })
    }
    const listRows = listRowsRes
    if (listRows.length === 0) return []
    const itemRows = db.select().from(listItems).orderBy(asc(listItems.sortOrder), asc(listItems.createdAt)).all() as any[]
    const byList = new Map<string, ListItemDto[]>()
    for (const item of itemRows) {
      const arr = byList.get(item.listId) ?? []
      arr.push(itemDto(item))
      byList.set(item.listId, arr)
    }
    return listRows.map((l) => {
      const items = byList.get(l.id) ?? []
      items.sort((a, b) => Number(a.checked) - Number(b.checked))
      return { id: l.id, name: l.name, color: l.color, kind: l.kind, items }
    })
  }

  function create(input: { name: string; color: string; kind: ListKind }): ListDto | Promise<ListDto> {
    const id = uuidv7()
    const maxRes = db.select({ value: max(lists.sortOrder) }).from(lists).all()
    if (maxRes instanceof Promise) {
      return maxRes.then(([{ value: maxSort }]: any[]) =>
        Promise.resolve(
          db
            .insert(lists)
            .values({ id, name: input.name, color: input.color, kind: input.kind, sortOrder: (maxSort ?? 0) + 1 })
        ).then(() => ({ id, name: input.name, color: input.color, kind: input.kind, items: [] }))
      )
    }
    const [{ value: maxSort }] = maxRes
    db.insert(lists)
      .values({ id, name: input.name, color: input.color, kind: input.kind, sortOrder: (maxSort ?? 0) + 1 })
      .run()
    return { id, name: input.name, color: input.color, kind: input.kind, items: [] }
  }

  function update(input: { id: string; name?: string; color?: string }): ListDto | Promise<ListDto> {
    const patch: Partial<typeof lists.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.color !== undefined) patch.color = input.color
    const res = db
      .update(lists)
      .set(patch)
      .where(and(eq(lists.id, input.id), isNull(lists.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => Promise.resolve(getAll())).then((all: ListDto[]) => {
        const found = all.find((l) => l.id === input.id)
        if (!found) throw notFound('List')
        return found
      })
    }
    if ((res as any).changes === 0) throw notFound('List')
    const all = getAll() as ListDto[]
    return all.find((l) => l.id === input.id)!
  }

  function remove(id: string): void | Promise<void> {
    const res = db
      .update(lists)
      .set({ deletedAt: isoUtc(DateTime.utc()) })
      .where(and(eq(lists.id, id), isNull(lists.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('List')
  }

  function addItem(listId: string, text: string): ListItemDto | Promise<ListItemDto> {
    const listRes = db.select().from(lists).where(and(eq(lists.id, listId), isNull(lists.deletedAt))).all()
    if (listRes instanceof Promise) {
      return listRes.then(([list]: any[]) => {
        if (!list) throw notFound('List')
        return Promise.resolve(
          db.select({ value: max(listItems.sortOrder) }).from(listItems).where(eq(listItems.listId, listId)).all()
        ).then(([{ value: maxSort }]: any[]) => {
          const id = uuidv7()
          const row: typeof listItems.$inferInsert = {
            id,
            listId,
            text,
            checked: false,
            sortOrder: (maxSort ?? 0) + 1,
            createdAt: isoUtc(DateTime.utc())
          }
          return Promise.resolve(db.insert(listItems).values(row)).then(() => ({
            id,
            text,
            checked: false,
            sortOrder: row.sortOrder!
          }))
        })
      })
    }
    const [list] = listRes
    if (!list) throw notFound('List')
    const [{ value: maxSort }] = db
      .select({ value: max(listItems.sortOrder) })
      .from(listItems)
      .where(eq(listItems.listId, listId))
      .all()
    const id = uuidv7()
    const row: typeof listItems.$inferInsert = {
      id,
      listId,
      text,
      checked: false,
      sortOrder: (maxSort ?? 0) + 1,
      createdAt: isoUtc(DateTime.utc())
    }
    db.insert(listItems).values(row).run()
    return { id, text, checked: false, sortOrder: row.sortOrder! }
  }

  function toggleItem(id: string): void | Promise<void> {
    const itemRes = db.select().from(listItems).where(eq(listItems.id, id)).all()
    if (itemRes instanceof Promise) {
      return itemRes.then(([item]: any[]) => {
        if (!item) throw notFound('Item')
        return db
          .update(listItems)
          .set({ checked: !item.checked, checkedAt: item.checked ? null : isoUtc(DateTime.utc()) })
          .where(eq(listItems.id, id))
      })
    }
    const [item] = itemRes
    if (!item) throw notFound('Item')
    db.update(listItems)
      .set({ checked: !item.checked, checkedAt: item.checked ? null : isoUtc(DateTime.utc()) })
      .where(eq(listItems.id, id))
      .run()
  }

  function removeItem(id: string): void | Promise<void> {
    const res = db.delete(listItems).where(eq(listItems.id, id)).run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('Item')
  }

  function clearChecked(listId: string): void | Promise<void> {
    const res = db.delete(listItems).where(and(eq(listItems.listId, listId), eq(listItems.checked, true))).run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
  }

  return { getAll, create, update, remove, addItem, toggleItem, removeItem, clearChecked }
}

export type ListsService = ReturnType<typeof createListsService>
