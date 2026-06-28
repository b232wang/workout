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
      end_date      TEXT NOT NULL,      -- ISO8601
      duration_sec  REAL,
      distance_m    REAL,
      energy_kcal   REAL,
      source        TEXT,               -- e.g. "Apple Watch"
      raw           TEXT,               -- full original payload (future-proofing)
      received_at   TEXT NOT NULL       -- server insert time, ISO8601
    );
    CREATE INDEX IF NOT EXISTS idx_workouts_received ON workouts(received_at);
    CREATE INDEX IF NOT EXISTS idx_workouts_start ON workouts(start_date);
  `);
  return db;
}

// Insert a batch. Duplicate UUIDs are silently ignored (idempotent re-sync).
export function insertWorkouts(db, workouts, receivedAt) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO workouts
      (uuid, activity_type, start_date, end_date, duration_sec, distance_m, energy_kcal, source, raw, received_at)
    VALUES
      (@uuid, @activityType, @startDate, @endDate, @durationSec, @distanceM, @energyKcal, @source, @raw, @receivedAt)
  `);

  const tx = db.transaction((items) => {
    let inserted = 0;
    for (const w of items) {
      const info = stmt.run({
        uuid: w.uuid,
        activityType: w.activityType,
        startDate: w.startDate,
        endDate: w.endDate,
        durationSec: w.durationSec ?? null,
        distanceM: w.distanceM ?? null,
        energyKcal: w.energyKcal ?? null,
        source: w.source ?? null,
        raw: JSON.stringify(w),
        receivedAt,
      });
      inserted += info.changes;
    }
    return inserted;
  });

  const inserted = tx(workouts);
  return { inserted, skipped: workouts.length - inserted };
}

// List workouts, optionally only those ingested after `since` (received_at > since).
export function listWorkouts(db, since = null) {
  if (since) {
    return db
      .prepare('SELECT * FROM workouts WHERE received_at > ? ORDER BY start_date ASC')
      .all(since);
  }
  return db.prepare('SELECT * FROM workouts ORDER BY start_date ASC').all();
}
