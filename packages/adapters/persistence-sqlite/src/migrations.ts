export interface Migration {
  /** Strictly increasing from 1. Never renumber or edit a migration that has shipped. */
  readonly version: number
  readonly name: string
  readonly sql: string
}

/**
 * Forward-only. To change the schema, append a migration.
 * Cross-aggregate references (dashboards to households, memberships to users) are
 * deliberately not foreign keys: the application layer owns those rules. Foreign keys
 * exist only inside an aggregate, so deleting a parent removes its children.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'households-and-dashboards',
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL
      ) STRICT;

      CREATE TABLE households (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      ) STRICT;

      CREATE TABLE household_members (
        household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        position INTEGER NOT NULL,
        PRIMARY KEY (household_id, user_id)
      ) STRICT;
      CREATE INDEX household_members_by_user ON household_members(user_id);

      CREATE TABLE dashboards (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        name TEXT NOT NULL,
        columns INTEGER NOT NULL CHECK (columns BETWEEN 1 AND 4)
      ) STRICT;
      CREATE INDEX dashboards_by_household ON dashboards(household_id);

      CREATE TABLE dashboard_widgets (
        id TEXT PRIMARY KEY,
        dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        type TEXT NOT NULL,
        span INTEGER NOT NULL CHECK (span >= 1),
        config TEXT NOT NULL,
        UNIQUE (dashboard_id, position)
      ) STRICT;
    `,
  },
  {
    version: 2,
    name: 'credentials-and-sessions',
    sql: `
      CREATE TABLE credentials (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL
      ) STRICT;

      CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX sessions_by_expiry ON sessions(expires_at);
    `,
  },
  {
    version: 3,
    name: 'invitations',
    sql: `
      CREATE TABLE invitations (
        id TEXT PRIMARY KEY,
        household_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
        token_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_by TEXT,
        accepted_at TEXT,
        revoked_at TEXT
      ) STRICT;
      CREATE INDEX invitations_by_household ON invitations(household_id);
    `,
  },
  {
    version: 4,
    name: 'planets-secrets-and-jobs',
    sql: `
      CREATE TABLE secrets (
        scope TEXT NOT NULL,
        name TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (scope, name)
      ) STRICT;

      CREATE TABLE scheduled_jobs (
        id TEXT PRIMARY KEY,
        run_at TEXT NOT NULL,
        payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX scheduled_jobs_by_run_at ON scheduled_jobs(run_at);

      CREATE TABLE planet_state (
        planet_id TEXT NOT NULL,
        placement_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT,
        failures INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        PRIMARY KEY (planet_id, placement_id)
      ) STRICT;

      CREATE TABLE planet_webhooks (
        token_hash TEXT PRIMARY KEY,
        planet_id TEXT NOT NULL,
        placement_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (planet_id, placement_id, source_id)
      ) STRICT;
    `,
  },
]
