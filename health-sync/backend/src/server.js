import express from 'express';
import {
  openDb,
  insertBatch,
  listWorkouts,
  listQuantitySamples,
  listSleepSamples,
} from './db.js';
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
app.use(express.json({ limit: '8mb' })); // room for backfill chunks + multi-type batches

// Unauthenticated liveness probe (for Docker / reverse proxy). Leaks nothing.
app.get('/healthz', (req, res) => res.json({ ok: true }));

// iPhone -> NAS: push an export envelope { data: { workouts, quantitySamples, sleepSamples } }.
// Idempotent: dedup by uuid across re-sends.
app.post('/ingest', auth, (req, res) => {
  const check = validateIngest(req.body);
  if (!check.ok) return res.status(400).json({ error: check.error });

  const receivedAt = new Date().toISOString();
  const result = insertBatch(db, req.body.data, receivedAt);
  console.log(`[ingest] device=${req.body.device ?? '?'} ${JSON.stringify(result)}`);
  res.json({
    ok: true,
    inserted: pick(result, 'inserted'),
    skipped: pick(result, 'skipped'),
  });
});

// Mac -> NAS readers. ?since=<ISO> filters by received_at (incremental pull).
app.get('/workouts', auth, (req, res) => {
  res.json({ workouts: listWorkouts(db, sinceOf(req)).map(workoutToApi) });
});

app.get('/quantity-samples', auth, (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : null;
  res.json({
    quantitySamples: listQuantitySamples(db, { since: sinceOf(req), type }).map(quantityToApi),
  });
});

app.get('/sleep', auth, (req, res) => {
  res.json({ sleepSamples: listSleepSamples(db, sinceOf(req)).map(sleepToApi) });
});

function sinceOf(req) {
  return typeof req.query.since === 'string' ? req.query.since : null;
}

function pick(result, field) {
  return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v[field]]));
}

function workoutToApi(r) {
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

function quantityToApi(r) {
  return {
    uuid: r.uuid,
    type: r.type,
    startDate: r.start_date,
    endDate: r.end_date,
    value: r.value,
    unit: r.unit,
    source: r.source,
    receivedAt: r.received_at,
  };
}

function sleepToApi(r) {
  return {
    uuid: r.uuid,
    startDate: r.start_date,
    endDate: r.end_date,
    stage: r.stage,
    source: r.source,
    receivedAt: r.received_at,
  };
}

app.listen(PORT, () => console.log(`health-ingest listening on :${PORT} (db=${DB_PATH})`));
