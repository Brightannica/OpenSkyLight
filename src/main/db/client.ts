import Database from 'better-sqlite3'
import { drizzle as drizzleBetterSqlite } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { createClient, type Client as LibsqlClient } from '@libsql/client'
import postgres from 'postgres'
import * as schema from './schema'
import { runMigrations, runLibsqlMigrations } from './migrations'
import { uuidv7 } from '@shared/uuid'

export type AppDb = any

export interface DbHandle {
  sqlite?: Database.Database
  libsql?: LibsqlClient
  pg?: ReturnType<typeof postgres>
  db: AppDb
}

export function openDatabase(dbPath?: string): DbHandle {
  const dbUrl = process.env.DATABASE_URL || process.env.LIBSQL_URL
  const authToken = process.env.LIBSQL_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN

  if (dbUrl) {
    if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
      const pg = postgres(dbUrl)
      const db = drizzlePostgres(pg)
      runLibsqlMigrationsForPg(pg).then(() => seedDefaultsAsync(db)).catch((err) => {
        console.error('[db] Error running postgres migrations:', err)
      })
      return { pg, db }
    }

    const libsql = createClient({ url: dbUrl, authToken })
    const db = drizzleLibsql(libsql, { schema })
    runLibsqlMigrations(libsql).then(() => {
      seedDefaultsAsync(db)
    }).catch((err) => {
      console.error('[db] Error running libsql migrations:', err)
    })
    return { libsql, db }
  }

  const path = dbPath || 'openskylight.db'
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  runMigrations(sqlite)
  const db = drizzleBetterSqlite(sqlite, { schema })
  seedDefaultsSync(db)
  return { sqlite, db }
}

export async function openDatabaseAsync(dbPath?: string): Promise<DbHandle> {
  const dbUrl = process.env.DATABASE_URL || process.env.LIBSQL_URL
  const authToken = process.env.LIBSQL_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN

  if (dbUrl) {
    if (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://')) {
      const pg = postgres(dbUrl)
      const db = drizzlePostgres(pg)
      await runLibsqlMigrationsForPg(pg)
      await seedDefaultsAsync(db)
      return { pg, db }
    }

    const libsql = createClient({ url: dbUrl, authToken })
    await runLibsqlMigrations(libsql)
    const db = drizzleLibsql(libsql, { schema })
    await seedDefaultsAsync(db)
    return { libsql, db }
  }

  return openDatabase(dbPath)
}

async function runLibsqlMigrationsForPg(pg: ReturnType<typeof postgres>): Promise<void> {
  await pg`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'child',
      avatar_path TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS google_accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      refresh_token_enc BYTEA,
      scopes TEXT,
      connected_at TEXT,
      last_refresh_error TEXT
    );
    CREATE TABLE IF NOT EXISTS calendars (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL DEFAULT 'local',
      google_account_id TEXT REFERENCES google_accounts(id),
      google_calendar_id TEXT,
      ics_url TEXT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#0091FF',
      read_only BOOLEAN NOT NULL DEFAULT false,
      visible BOOLEAN NOT NULL DEFAULT true,
      sync_token TEXT,
      ics_etag TEXT,
      ics_last_modified TEXT,
      last_synced_at TEXT,
      sync_error TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      calendar_id TEXT NOT NULL REFERENCES calendars(id),
      provider_event_id TEXT,
      etag TEXT,
      ical_uid TEXT,
      title TEXT NOT NULL DEFAULT '',
      description TEXT,
      location TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      tz TEXT NOT NULL,
      all_day BOOLEAN NOT NULL DEFAULT false,
      rrule TEXT,
      rdates TEXT,
      exdates TEXT,
      recurring_event_id TEXT,
      original_start_at TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      dirty BOOLEAN NOT NULL DEFAULT false,
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      remote_updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS event_people (
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      PRIMARY KEY (event_id, person_id)
    );
    CREATE TABLE IF NOT EXISTS sync_outbox (
      id TEXT PRIMARY KEY,
      entity TEXT NOT NULL DEFAULT 'event',
      entity_id TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      base_etag TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chores (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT,
      person_id TEXT REFERENCES people(id),
      stars_value INTEGER NOT NULL DEFAULT 1,
      schedule_rrule TEXT,
      due_date TEXT,
      routine TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS chore_completions (
      id TEXT PRIMARY KEY,
      chore_id TEXT NOT NULL REFERENCES chores(id),
      person_id TEXT NOT NULL REFERENCES people(id),
      due_date TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      stars_awarded INTEGER NOT NULL DEFAULT 0,
      UNIQUE (chore_id, due_date)
    );
    CREATE TABLE IF NOT EXISTS star_ledger (
      id TEXT PRIMARY KEY,
      person_id TEXT NOT NULL REFERENCES people(id),
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ref_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rewards (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT,
      cost_stars INTEGER NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS reward_redemptions (
      id TEXT PRIMARY KEY,
      reward_id TEXT NOT NULL REFERENCES rewards(id),
      person_id TEXT NOT NULL REFERENCES people(id),
      stars_spent INTEGER NOT NULL,
      redeemed_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#0091FF',
      kind TEXT NOT NULL DEFAULT 'custom',
      sort_order INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS list_items (
      id TEXT PRIMARY KEY,
      list_id TEXT NOT NULL REFERENCES lists(id),
      text TEXT NOT NULL,
      checked BOOLEAN NOT NULL DEFAULT false,
      checked_at TEXT,
      person_id TEXT REFERENCES people(id),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ingredients TEXT,
      instructions TEXT,
      image_path TEXT,
      tags TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS meal_slots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      slot TEXT NOT NULL,
      recipe_id TEXT REFERENCES recipes(id),
      free_text TEXT,
      UNIQUE (date, slot)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `
}

function seedDefaultsSync(db: any): void {
  try {
    const existing = db.select({ id: schema.calendars.id }).from(schema.calendars).limit(1).all()
    if (existing.length === 0) {
      db.insert(schema.calendars)
        .values({
          id: uuidv7(),
          provider: 'local',
          name: 'Family',
          color: '#0091FF',
          readOnly: false,
          visible: true
        })
        .run()
    }
  } catch (err) {
    console.error('[db] seedDefaultsSync error:', err)
  }
}

async function seedDefaultsAsync(db: any): Promise<void> {
  try {
    const existing = await db.select({ id: schema.calendars.id }).from(schema.calendars).limit(1)
    if (existing.length === 0) {
      await db.insert(schema.calendars).values({
        id: uuidv7(),
        provider: 'local',
        name: 'Family',
        color: '#0091FF',
        readOnly: false,
        visible: true
      })
    }
  } catch (err) {
    console.error('[db] seedDefaultsAsync error:', err)
  }
}
