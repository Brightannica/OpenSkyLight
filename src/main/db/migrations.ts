import type DatabaseType from 'better-sqlite3'
import type { Client as LibsqlClient } from '@libsql/client'

/**
 * Hand-rolled migrations driven by PRAGMA user_version so the SQL ships inside the
 * bundled main process (no migration folder to package). Append new entries only —
 * never edit an existing one once released.
 */
const MIGRATIONS: string[] = [
  // 001 — initial schema
  `
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
    refresh_token_enc BLOB,
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
    read_only INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
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
    all_day INTEGER NOT NULL DEFAULT 0,
    rrule TEXT,
    rdates TEXT,
    exdates TEXT,
    recurring_event_id TEXT,
    original_start_at TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed',
    dirty INTEGER NOT NULL DEFAULT 0,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    remote_updated_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_events_calendar_start ON events(calendar_id, start_at);
  CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider_event_id);
  CREATE INDEX IF NOT EXISTS idx_events_master ON events(recurring_event_id);

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
    active INTEGER NOT NULL DEFAULT 1,
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
  CREATE INDEX IF NOT EXISTS idx_completions_chore_date ON chore_completions(chore_id, due_date);

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
    active INTEGER NOT NULL DEFAULT 1,
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
    checked INTEGER NOT NULL DEFAULT 0,
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
  CREATE INDEX IF NOT EXISTS idx_meal_slots_date ON meal_slots(date);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `
]

export function runMigrations(sqlite: DatabaseType.Database): void {
  const current = sqlite.pragma('user_version', { simple: true }) as number
  for (let v = current; v < MIGRATIONS.length; v++) {
    sqlite.transaction(() => {
      sqlite.exec(MIGRATIONS[v])
      sqlite.pragma(`user_version = ${v + 1}`)
    })()
  }
}

export async function runLibsqlMigrations(client: LibsqlClient): Promise<void> {
  const res = await client.execute('PRAGMA user_version')
  const row = res.rows[0] as unknown as Record<string, number> | undefined
  const current = (row ? Object.values(row)[0] : 0) || 0

  for (let v = current; v < MIGRATIONS.length; v++) {
    await client.executeMultiple(MIGRATIONS[v])
    await client.execute(`PRAGMA user_version = ${v + 1}`)
  }
}
