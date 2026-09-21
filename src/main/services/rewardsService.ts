import { and, asc, desc, eq, isNull } from 'drizzle-orm'
import { DateTime } from 'luxon'
import type { AppDb } from '../db/client'
import { rewardRedemptions, rewards, starLedger } from '../db/schema'
import { uuidv7 } from '@shared/uuid'
import { isoUtc } from '@shared/dates'
import type { RedemptionDto, RewardDto } from '@shared/types'
import type { ChoresService } from './choresService'
import { invalid, notFound } from './errors'

export function createRewardsService(db: AppDb, choresService: ChoresService) {
  function toDto(row: typeof rewards.$inferSelect): RewardDto {
    return { id: row.id, title: row.title, icon: row.icon, costStars: row.costStars, active: row.active }
  }

  function list(): RewardDto[] | Promise<RewardDto[]> {
    const res = db
      .select()
      .from(rewards)
      .where(and(isNull(rewards.deletedAt), eq(rewards.active, true)))
      .orderBy(asc(rewards.costStars), asc(rewards.sortOrder))
      .all()
    if (res instanceof Promise) {
      return res.then((rows: any[]) => rows.map(toDto))
    }
    return res.map(toDto)
  }

  function create(input: { title: string; costStars: number }): RewardDto | Promise<RewardDto> {
    const id = uuidv7()
    const res = db.insert(rewards).values({ id, title: input.title, costStars: input.costStars, active: true }).run()
    if (res instanceof Promise) {
      return res.then(() => db.select().from(rewards).where(eq(rewards.id, id)).all()).then(([row]: any[]) => toDto(row))
    }
    const [row] = db.select().from(rewards).where(eq(rewards.id, id)).all()
    return toDto(row)
  }

  function update(input: { id: string; title?: string; costStars?: number; active?: boolean }): RewardDto | Promise<RewardDto> {
    const patch: Partial<typeof rewards.$inferInsert> = {}
    if (input.title !== undefined) patch.title = input.title
    if (input.costStars !== undefined) patch.costStars = input.costStars
    if (input.active !== undefined) patch.active = input.active
    const res = db
      .update(rewards)
      .set(patch)
      .where(and(eq(rewards.id, input.id), isNull(rewards.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => db.select().from(rewards).where(eq(rewards.id, input.id)).all()).then(([row]: any[]) => {
        if (!row) throw notFound('Reward')
        return toDto(row)
      })
    }
    if ((res as any).changes === 0) throw notFound('Reward')
    const [row] = db.select().from(rewards).where(eq(rewards.id, input.id)).all()
    return toDto(row)
  }

  function remove(id: string): void | Promise<void> {
    const res = db
      .update(rewards)
      .set({ deletedAt: isoUtc(DateTime.utc()) })
      .where(and(eq(rewards.id, id), isNull(rewards.deletedAt)))
      .run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('Reward')
  }

  function redemptionDto(
    row: typeof rewardRedemptions.$inferSelect,
    rewardTitle: string
  ): RedemptionDto {
    return {
      id: row.id,
      rewardId: row.rewardId,
      rewardTitle,
      personId: row.personId,
      starsSpent: row.starsSpent,
      redeemedAt: row.redeemedAt,
      status: row.status
    }
  }

  function redeem(rewardId: string, personId: string): RedemptionDto | Promise<RedemptionDto> {
    const rewardRes = db.select().from(rewards).where(and(eq(rewards.id, rewardId), isNull(rewards.deletedAt))).all()
    if (rewardRes instanceof Promise) {
      return rewardRes.then(([reward]: any[]) => {
        if (!reward) throw notFound('Reward')
        return Promise.resolve(choresService.balanceOf(personId)).then((balance) => {
          if (balance < reward.costStars) {
            throw invalid(`Not enough stars yet — ${reward.costStars - balance} more to go!`)
          }
          const id = uuidv7()
          const now = isoUtc(DateTime.utc())
          return Promise.resolve(
            db.insert(rewardRedemptions).values({ id, rewardId, personId, starsSpent: reward.costStars, redeemedAt: now, status: 'pending' })
          ).then(() =>
            db.insert(starLedger).values({
              id: uuidv7(),
              personId,
              delta: -reward.costStars,
              reason: 'redemption',
              refId: id,
              createdAt: now
            })
          ).then(() => db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, id)).all()).then(([row]: any[]) => redemptionDto(row, reward.title))
        })
      })
    }
    const [reward] = rewardRes
    if (!reward) throw notFound('Reward')
    const balRes = choresService.balanceOf(personId)
    const balance = typeof balRes === 'number' ? balRes : 0
    if (balance < reward.costStars) {
      throw invalid(`Not enough stars yet — ${reward.costStars - balance} more to go!`)
    }
    const id = uuidv7()
    const now = isoUtc(DateTime.utc())
    db.transaction((tx) => {
      tx.insert(rewardRedemptions)
        .values({ id, rewardId, personId, starsSpent: reward.costStars, redeemedAt: now, status: 'pending' })
        .run()
      tx.insert(starLedger)
        .values({
          id: uuidv7(),
          personId,
          delta: -reward.costStars,
          reason: 'redemption',
          refId: id,
          createdAt: now
        })
        .run()
    })
    const [row] = db.select().from(rewardRedemptions).where(eq(rewardRedemptions.id, id)).all()
    return redemptionDto(row, reward.title)
  }

  function pendingRedemptions(): RedemptionDto[] | Promise<RedemptionDto[]> {
    const rowsRes = db
      .select({ redemption: rewardRedemptions, rewardTitle: rewards.title })
      .from(rewardRedemptions)
      .innerJoin(rewards, eq(rewards.id, rewardRedemptions.rewardId))
      .where(eq(rewardRedemptions.status, 'pending'))
      .orderBy(desc(rewardRedemptions.redeemedAt))
      .all()
    if (rowsRes instanceof Promise) {
      return rowsRes.then((rows: any[]) => rows.map((r) => redemptionDto(r.redemption, r.rewardTitle)))
    }
    return rowsRes.map((r) => redemptionDto(r.redemption, r.rewardTitle))
  }

  function grant(redemptionId: string): void | Promise<void> {
    const res = db
      .update(rewardRedemptions)
      .set({ status: 'granted' })
      .where(and(eq(rewardRedemptions.id, redemptionId), eq(rewardRedemptions.status, 'pending')))
      .run()
    if (res instanceof Promise) {
      return res.then(() => {})
    }
    if ((res as any).changes === 0) throw notFound('Redemption')
  }

  return { list, create, update, remove, redeem, pendingRedemptions, grant }
}

export type RewardsService = ReturnType<typeof createRewardsService>
