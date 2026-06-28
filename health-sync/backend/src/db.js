import Database from 'better-sqlite3';

// Open (or create) the SQLite database and ensure the schema exists.
export function openDb(path) {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS workouts (
      uuid          TEXT PRIMARY KEY,   -- HealthKit sample UUID, used for dedup
      activity_type TEXT NOT NULL,      -- e.g. "walking", "cycling"
      start_date    TEXT NOT NULL,      -- ISO8601
      end_date      TEXT NOT NULL,
      duration_sec  REAL,
      distance_m    REAL,
      energy_kcal   REAL,
      source        TEXT,               -- e.g. "Apple Watch"
      raw           TEXT,               -- full original item (future-proofing)
      received_at   TEXT NOT NULL       -- server insert time, ISO8601
    );
    CREATE INDEX IF NOT EXISTS idx_workouts_received ON workouts(received_at);
    CREATE INDEX IF NOT EXISTS idx_workouts_start ON workouts(start_date);

    CREATE TABLE IF NOT EXISTS quantity_samples (
      uuid        TEXT PRIMARY KEY,
      type        TEXT NOT NULL,        -- e.g. "heartRate", "stepCount", "bodyMass"
      start_date  TEXT NOT NULL,
      end_date    TEXT NOT NULL,
      value       REAL NOT NULL,
      unit        TEXT NOT NULL,        -- e.g. "count/min", "kg"
      source      TEXT,
      raw         TEXT,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quantity_received ON quantity_samples(received_at);
    CREATE INDEX IF NOT EXISTS idx_quantity_type_start ON quantity_samples(type, start_date);

    CREATE TABLE IF NOT EXISTS sleep_samples (
      uuid        TEXT PRIMARY KEY,
      start_date  TEXT NOT NULL,
      end_date    TEXT NOT NULL,
      stage       TEXT NOT NULL,        -- inBed / asleepCore / asleepDeep / asleepREM / awake
      source      TEXT,
      raw         TEXT,
      received_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sleep_received ON sleep_samples(received_at);
    CREATE INDEX IF NOT EXISTS idx_sleep_start ON sleep_samples(start_date);
  `);
  return db;
}

// Per-group SQL + row mapping. Adding a new HealthKit group = add an entry here + a table above.
const INSERTERS = {
  workouts: {
    sql: `INSERT OR IGNORE INTO workouts
      (uuid, activity_type, start_date, end_date, duration_sec, distance_m, energy_kcal, source, raw, received_at)
      VALUES (@uuid, @activityType, @startDate, @endDate, @durationSec, @distanceM, @energyKcal, @source, @raw, @receivedAt)`,
    map: (w, receivedAt) => ({
      uuid: w.uuid, activityType: w.activityType, startDate: w.startDate, endDate: w.endDate,
      durationSec: w.durationSec ?? null, distanceM: w.distanceM ?? null, energyKcal: w.energyKcal ?? null,
      source: w.source ?? null, raw: JSON.stringify(w), receivedAt,
    }),
  },
  quantitySamples: {
    sql: `INSERT OR IGNORE INTO quantity_samples
      (uuid, type, start_date, end_date, value, unit, source, raw, received_at)
      VALUES (@uuid, @type, @startDate, @endDate, @value, @unit, @source, @raw, @receivedAt)`,
    map: (s, receivedAt) => ({
      uuid: s.uuid, type: s.type, startDate: s.startDate, endDate: s.endDate,
      value: s.value, unit: s.unit, source: s.source ?? null, raw: JSON.stringify(s), receivedAt,
    }),
  },
  sleepSamples: {
    sql: `INSERT OR IGNORE INTO sleep_samples
      (uuid, start_date, end_date, stage, source, raw, received_at)
      VALUES (@uuid, @startDate, @endDate, @stage, @source, @raw, @receivedAt)`,
    map: (s, receivedAt) => ({
      uuid: s.uuid, startDate: s.startDate, endDate: s.endDate, stage: s.stage,
      source: s.source ?? null, raw: JSON.stringify(s), receivedAt,
    }),
  },
};

// Insert an export envelope's `data` (workouts / quantitySamples / sleepSamples) in one transaction.
// Idempotent: duplicate UUIDs are ignored. Returns per-group { inserted, skipped }.
export function insertBatch(db, data, receivedAt) {
  const result = {};
  const tx = db.transaction(() => {
    for (const [group, { sql, map }] of Object.entries(INSERTERS)) {
      const items = Array.isArray(data?.[group]) ? data[group] : [];
      const stmt = db.prepare(sql);
      let inserted = 0;
      for (const item of items) {
        inserted += stmt.run(map(item, receivedAt)).changes;
      }
      result[group] = { inserted, skipped: items.length - inserted };
    }
  });
  tx();
  return result;
}

export function listWorkouts(db, since = null) {
  return since
    ? db.prepare('SELECT * FROM workouts WHERE received_at > ? ORDER BY start_date ASC').all(since)
    : db.prepare('SELECT * FROM workouts ORDER BY start_date ASC').all();
}

export function listQuantitySamples(db, { since = null, type = null } = {}) {
  const where = [];
  const params = [];
  if (since) { where.push('received_at > ?'); params.push(since); }
  if (type) { where.push('type = ?'); params.push(type); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return db.prepare(`SELECT * FROM quantity_samples ${clause} ORDER BY start_date ASC`).all(...params);
}

export function listSleepSamples(db, since = null) {
  return since
    ? db.prepare('SELECT * FROM sleep_samples WHERE received_at > ? ORDER BY start_date ASC').all(since)
    : db.prepare('SELECT * FROM sleep_samples ORDER BY start_date ASC').all();
}
