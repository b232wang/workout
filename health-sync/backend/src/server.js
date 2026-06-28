import express from 'express';
import { openDb, insertWorkouts, listWorkouts } from './db.js';
import { requireToken } from './auth.js';
import { validateIngest } from './validate.js';

const PORT = Number(process.env.PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? '/data/health.db';
const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN || API_TOKEN.length < 16) {
  console.error('FATAL: API_TOKEN env var missing or too short (need >= 16 chars).');
  process.exit(1);
}

const db = openDb(DB_PATH);
const auth = requireToken(API_TOKEN);

const app = express();
app.use(express.json({ limit: '2mb' }));

// Unauthenticated liveness probe (for Docker / reverse proxy). Leaks nothing.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// iPhone -> NAS: push HealthKit workouts (idempotent, dedup by uuid).
app.post('/ingest', auth, (req, res) => {
  const check = validateIngest(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const receivedAt = new Date().toISOString();
  const { inserted, skipped } = insertWorkouts(db, req.body.workouts, receivedAt);
  console.log(`[ingest] received=${req.body.workouts.length} inserted=${inserted} skipped=${skipped}`);
  res.json({ ok: true, inserted, skipped });
});

// Mac -> NAS: pull workouts, optionally only those ingested after ?since=<ISO>.
app.get('/workouts', auth, (req, res) => {
  const since = typeof req.query.since === 'string' ? req.query.since : null;
  res.json({ workouts: listWorkouts(db, since).map(toApi) });
});

function toApi(r) {
  return {
    uuid: r.uuid,
    activityType: r.activity_type,
    startDate: r.start_date,
    endDate: r.end_date,
    durationSec: r.duration_sec,
    distanceM: r.distance_m,
    energyKcal: r.energy_kcal,
    source: r.source,
    receivedAt: r.received_at,
  };
}

app.listen(PORT, () => console.log(`health-ingest listening on :${PORT} (db=${DB_PATH})`));
