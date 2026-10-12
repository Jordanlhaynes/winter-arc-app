import { ArcLog, PILLARS, PillarType } from '@/engine/scoring';

import { db } from './client';

export type Cycle = { id: string; startDate: string; status: 'active' | 'complete' };
export type Goals = Record<PillarType, string>;
export type Task = { title: string; detail: string | null; source: 'ai' | 'user' };
/** Keyed by `${pillar}:${day}` */
export type TaskMap = Record<string, Task>;

export type ArcData = {
  cycle: Cycle;
  goals: Goals;
  tasks: TaskMap;
  log: ArcLog;
  /** Missed days already made up, per pillar. */
  madeUpDays: Record<PillarType, number[]>;
};

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const nowIso = () => new Date().toISOString();

export function getActiveCycle(): Cycle | null {
  const row = db.getFirstSync<{ id: string; start_date: string; status: Cycle['status'] }>(
    "SELECT id, start_date, status FROM cycles WHERE status = 'active' ORDER BY created_at DESC LIMIT 1",
  );
  return row ? { id: row.id, startDate: row.start_date, status: row.status } : null;
}

export function createCycle(startDate: string, goals: Goals): string {
  const id = newId();
  db.withTransactionSync(() => {
    db.runSync(
      'INSERT INTO cycles (id, start_date, status, created_at) VALUES (?, ?, ?, ?)',
      id,
      startDate,
      'active',
      nowIso(),
    );
    for (const p of PILLARS) {
      db.runSync('INSERT INTO pillars (cycle_id, type, goal_text) VALUES (?, ?, ?)', id, p, goals[p]);
    }
  });
  return id;
}

export function loadArc(cycle: Cycle): ArcData {
  const goals = {} as Goals;
  for (const row of db.getAllSync<{ type: PillarType; goal_text: string }>(
    'SELECT type, goal_text FROM pillars WHERE cycle_id = ?',
    cycle.id,
  )) {
    goals[row.type] = row.goal_text;
  }

  const tasks: TaskMap = {};
  for (const row of db.getAllSync<{
    pillar: PillarType;
    day: number;
    title: string;
    detail: string | null;
    source: Task['source'];
  }>('SELECT pillar, day, title, detail, source FROM tasks WHERE cycle_id = ?', cycle.id)) {
    tasks[`${row.pillar}:${row.day}`] = { title: row.title, detail: row.detail, source: row.source };
  }

  const completions = db.getAllSync<{ pillar: PillarType; day: number }>(
    'SELECT pillar, day FROM completions WHERE cycle_id = ?',
    cycle.id,
  );
  const skips = db
    .getAllSync<{ day: number }>('SELECT day FROM skips WHERE cycle_id = ?', cycle.id)
    .map((r) => r.day);
  const recoveryRows = db.getAllSync<{ pillar: PillarType; day: number; for_day: number | null }>(
    'SELECT pillar, day, for_day FROM recoveries WHERE cycle_id = ?',
    cycle.id,
  );

  const madeUpDays = Object.fromEntries(PILLARS.map((p) => [p, [] as number[]])) as Record<
    PillarType,
    number[]
  >;
  for (const r of recoveryRows) {
    if (r.for_day != null) madeUpDays[r.pillar].push(r.for_day);
  }

  return {
    cycle,
    goals,
    tasks,
    log: {
      startDate: cycle.startDate,
      completions,
      skips,
      recoveries: recoveryRows.map((r) => ({ pillar: r.pillar, day: r.day })),
    },
    madeUpDays,
  };
}

export function setCompletion(cycleId: string, pillar: PillarType, day: number, done: boolean) {
  if (done) {
    db.runSync(
      'INSERT OR IGNORE INTO completions (cycle_id, pillar, day, completed_at) VALUES (?, ?, ?, ?)',
      cycleId,
      pillar,
      day,
      nowIso(),
    );
  } else {
    db.runSync(
      'DELETE FROM completions WHERE cycle_id = ? AND pillar = ? AND day = ?',
      cycleId,
      pillar,
      day,
    );
  }
}

export function setSkip(cycleId: string, day: number, skipped: boolean) {
  if (skipped) {
    db.runSync('INSERT OR IGNORE INTO skips (cycle_id, day) VALUES (?, ?)', cycleId, day);
  } else {
    db.runSync('DELETE FROM skips WHERE cycle_id = ? AND day = ?', cycleId, day);
  }
}

export function addRecovery(cycleId: string, pillar: PillarType, day: number, forDay: number | null) {
  db.runSync(
    'INSERT INTO recoveries (cycle_id, pillar, day, for_day, created_at) VALUES (?, ?, ?, ?, ?)',
    cycleId,
    pillar,
    day,
    forDay,
    nowIso(),
  );
}

export function saveTask(cycleId: string, pillar: PillarType, day: number, task: Task) {
  db.runSync(
    `INSERT INTO tasks (cycle_id, pillar, day, title, detail, source) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (cycle_id, pillar, day) DO UPDATE SET title = excluded.title, detail = excluded.detail, source = excluded.source`,
    cycleId,
    pillar,
    day,
    task.title,
    task.detail,
    task.source,
  );
}

export function completeCycle(cycleId: string) {
  db.runSync("UPDATE cycles SET status = 'complete' WHERE id = ?", cycleId);
}

export type CoachSlot = 'morning' | 'evening';

export function getCoachMessage(cycleId: string, day: number, slot: CoachSlot): string | null {
  return (
    db.getFirstSync<{ text: string }>(
      'SELECT text FROM coach_messages WHERE cycle_id = ? AND day = ? AND slot = ?',
      cycleId,
      day,
      slot,
    )?.text ?? null
  );
}

export function saveCoachMessage(cycleId: string, day: number, slot: CoachSlot, text: string) {
  db.runSync(
    `INSERT INTO coach_messages (cycle_id, day, slot, text, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (cycle_id, day, slot) DO UPDATE SET text = excluded.text, created_at = excluded.created_at`,
    cycleId,
    day,
    slot,
    text,
    nowIso(),
  );
}

/** Saves AI-planned tasks, never overwriting a task the user wrote or edited. */
export function saveAiTasks(
  cycleId: string,
  tasks: { day: number; pillar: PillarType; title: string; detail: string }[],
) {
  db.withTransactionSync(() => {
    for (const t of tasks) {
      db.runSync(
        `INSERT INTO tasks (cycle_id, pillar, day, title, detail, source) VALUES (?, ?, ?, ?, ?, 'ai')
         ON CONFLICT (cycle_id, pillar, day) DO UPDATE SET title = excluded.title, detail = excluded.detail
         WHERE tasks.source = 'ai'`,
        cycleId,
        t.pillar,
        t.day,
        t.title,
        t.detail,
      );
    }
  });
}

const TABLES = ['cycles', 'pillars', 'tasks', 'completions', 'skips', 'recoveries', 'coach_messages'] as const;
type Row = Record<string, string | number | null>;

export const SNAPSHOT_VERSION = 1;
export type Snapshot = { version: number; exportedAt: string } & Record<(typeof TABLES)[number], Row[]>;

export function deleteAllData() {
  db.withTransactionSync(() => {
    for (const t of [...TABLES].reverse()) db.execSync(`DELETE FROM ${t}`);
  });
}

/** Every row of every table — the full history, all Arcs. */
export function exportSnapshot(): Snapshot {
  const snapshot = { version: SNAPSHOT_VERSION, exportedAt: nowIso() } as Snapshot;
  for (const t of TABLES) snapshot[t] = db.getAllSync<Row>(`SELECT * FROM ${t}`);
  return snapshot;
}

export function hasAnyData(): boolean {
  return (db.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM cycles')?.n ?? 0) > 0;
}

/** Replaces all local data with the snapshot, atomically. */
export function importSnapshot(snapshot: Snapshot) {
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Backup format v${snapshot.version} isn't supported by this version of the app.`);
  }
  db.withTransactionSync(() => {
    for (const t of [...TABLES].reverse()) db.execSync(`DELETE FROM ${t}`);
    for (const t of TABLES) {
      // Column names are spliced into SQL, so only accept ones the table really has (the snapshot is untrusted JSON).
      const known = new Set(db.getAllSync<{ name: string }>(`PRAGMA table_info(${t})`).map((c) => c.name));
      for (const row of snapshot[t] ?? []) {
        const cols = Object.keys(row).filter((c) => known.has(c));
        if (cols.length === 0) continue;
        db.runSync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c]),
        );
      }
    }
  });
}
