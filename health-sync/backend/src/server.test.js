import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  openDb,
  insertBatch,
  listWorkouts,
  listQuantitySamples,
  listSleepSamples,
} from './db.js';
import { validateIngest } from './validate.js';
import { requireToken } from './auth.js';

const workout = (over = {}) => ({
  uuid: 'w1', activityType: 'walking',
  startDate: '2026-06-28T10:00:00Z', endDate: '2026-06-28T10:45:00Z',
  durationSec: 2700, distanceM: 3200, energyKcal: 180, source: 'Apple Watch', ...over,
});
const quantity = (over = {}) => ({
  uuid: 'q1', type: 'heartRate',
  startDate: '2026-06-28T10:00:00Z', endDate: '2026-06-28T10:00:00Z',
  value: 72, unit: 'count/min', source: 'Apple Watch', ...over,
});
const sleep = (over = {}) => ({
  uuid: 's1', startDate: '2026-06-28T02:00:00Z', endDate: '2026-06-28T02:30:00Z',
  stage: 'asleepCore', source: 'Apple Watch', ...over,
});

test('insertBatch inserts all three types and dedups by uuid', () => {
  const db = openDb(':memory:');
  let r = insertBatch(db, { workouts: [workout()], quantitySamples: [quantity()], sleepSamples: [sleep()] }, '2026-06-28T11:00:00Z');
  assert.deepEqual(r.workouts, { inserted: 1, skipped: 0 });
  assert.deepEqual(r.quantitySamples, { inserted: 1, skipped: 0 });
  assert.deepEqual(r.sleepSamples, { inserted: 1, skipped: 0 });

  r = insertBatch(db, { workouts: [workout()], quantitySamples: [quantity()], sleepSamples: [sleep()] }, '2026-06-28T12:00:00Z');
  assert.deepEqual(r.workouts, { inserted: 0, skipped: 1 });
  assert.deepEqual(r.quantitySamples, { inserted: 0, skipped: 1 });
  assert.deepEqual(r.sleepSamples, { inserted: 0, skipped: 1 });

  assert.equal(listWorkouts(db).length, 1);
  assert.equal(listQuantitySamples(db).length, 1);
  assert.equal(listSleepSamples(db).length, 1);
});

test('insertBatch tolerates missing groups', () => {
  const db = openDb(':memory:');
  const r = insertBatch(db, { quantitySamples: [quantity()] }, '2026-06-28T11:00:00Z');
  assert.deepEqual(r.workouts, { inserted: 0, skipped: 0 });
  assert.deepEqual(r.quantitySamples, { inserted: 1, skipped: 0 });
  assert.deepEqual(r.sleepSamples, { inserted: 0, skipped: 0 });
});

test('listQuantitySamples filters by since and type', () => {
  const db = openDb(':memory:');
  insertBatch(db, { quantitySamples: [quantity({ uuid: 'a', type: 'heartRate' })] }, '2026-06-28T10:00:00Z');
  insertBatch(db, { quantitySamples: [quantity({ uuid: 'b', type: 'heartRate' }), quantity({ uuid: 'c', type: 'stepCount' })] }, '2026-06-28T12:00:00Z');

  assert.equal(listQuantitySamples(db, { since: '2026-06-28T11:00:00Z' }).length, 2); // b, c
  assert.equal(listQuantitySamples(db, { type: 'heartRate' }).length, 2); // a, b
  const filtered = listQuantitySamples(db, { since: '2026-06-28T11:00:00Z', type: 'stepCount' });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].uuid, 'c');
});

test('listWorkouts since filters by received_at', () => {
  const db = openDb(':memory:');
  insertBatch(db, { workouts: [workout({ uuid: 'a' })] }, '2026-06-28T10:00:00Z');
  insertBatch(db, { workouts: [workout({ uuid: 'b' })] }, '2026-06-28T12:00:00Z');
  const rows = listWorkouts(db, '2026-06-28T11:00:00Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uuid, 'b');
});

test('validateIngest accepts valid envelopes (full and partial)', () => {
  assert.equal(validateIngest({ data: { workouts: [workout()], quantitySamples: [quantity()], sleepSamples: [sleep()] } }).ok, true);
  assert.equal(validateIngest({ data: { quantitySamples: [quantity()] } }).ok, true);
});

test('validateIngest rejects malformed envelopes', () => {
  assert.equal(validateIngest(null).ok, false);
  assert.equal(validateIngest({}).ok, false); // no data
  assert.equal(validateIngest({ data: {} }).ok, false); // no samples
  assert.equal(validateIngest({ data: { workouts: 'x' } }).ok, false); // not an array
});

test('validateIngest rejects bad items per type', () => {
  assert.equal(validateIngest({ data: { workouts: [workout({ uuid: '' })] } }).ok, false); // missing uuid
  assert.equal(validateIngest({ data: { workouts: [workout({ startDate: 'nope' })] } }).ok, false); // bad date
  assert.equal(validateIngest({ data: { quantitySamples: [quantity({ value: 'high' })] } }).ok, false); // value not number
  assert.equal(validateIngest({ data: { quantitySamples: [quantity({ unit: '' })] } }).ok, false); // missing unit
  assert.equal(validateIngest({ data: { sleepSamples: [sleep({ stage: '' })] } }).ok, false); // missing stage
});

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

test('requireToken rejects missing / invalid, accepts valid', () => {
  const mw = requireToken('supersecrettoken1234');

  let res = mockRes();
  let nexted = false;
  mw({ get: () => '' }, res, () => { nexted = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(nexted, false);

  res = mockRes();
  nexted = false;
  mw({ get: () => 'Bearer wrong' }, res, () => { nexted = true; });
  assert.equal(res.statusCode, 401);

  res = mockRes();
  nexted = false;
  mw({ get: () => 'Bearer supersecrettoken1234' }, res, () => { nexted = true; });
  assert.equal(nexted, true);
});
