import * as SQLite from 'expo-sqlite';

// TODO(encryption): when moving off Expo Go to a development build, enable
// ["expo-sqlite", { "useSQLCipher": true }] in app.json and run
// `PRAGMA key = '<key from expo-secure-store>'` right after opening.
export const db = SQLite.openDatabaseSync('winterarc.db');

const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE cycles (
    id TEXT PRIMARY KEY NOT NULL,
    start_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL
  );
  CREATE TABLE pillars (
    cycle_id TEXT NOT NULL,
    type TEXT NOT NULL,
    goal_text TEXT NOT NULL,
    PRIMARY KEY (cycle_id, type)
  );
  CREATE TABLE tasks (
    cycle_id TEXT NOT NULL,
    pillar TEXT NOT NULL,
    day INTEGER NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    source TEXT NOT NULL DEFAULT 'user',
    PRIMARY KEY (cycle_id, pillar, day)
  );
  CREATE TABLE completions (
    cycle_id TEXT NOT NULL,
    pillar TEXT NOT NULL,
    day INTEGER NOT NULL,
    completed_at TEXT NOT NULL,
    PRIMARY KEY (cycle_id, pillar, day)
  );
  CREATE TABLE skips (
    cycle_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    PRIMARY KEY (cycle_id, day)
  );
  CREATE TABLE recoveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cycle_id TEXT NOT NULL,
    pillar TEXT NOT NULL,
    day INTEGER NOT NULL,
    for_day INTEGER,
    created_at TEXT NOT NULL
  );
  `,
  // v2: AI coach messages
  `
  CREATE TABLE coach_messages (
    cycle_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    slot TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (cycle_id, day, slot)
  );
  `,
];

export function migrate() {
  db.execSync('PRAGMA journal_mode = WAL;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[version]);
      db.execSync(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
}
