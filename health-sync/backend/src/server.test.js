import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, insertWorkouts, listWorkouts } from './db.js';
import { validateIngest } from './validate.js';
import { requireToken } from './auth.js';

const sample = (over = {}) => ({
  uuid: 'u1',
  activityType: 'walking',
  startDate: '2026-06-28T10:00:00Z',
  endDate: '2026-06-28T10:45:00Z',
  durationSec: 2700,
  distanceM: 3200,
  energyKcal: 180,
  source: 'Apple Watch',
  ...over,
});

test('insert then dedup by uuid', () => {
  const db = openDb(':memory:');
  let r = insertWorkouts(db, [sample()], '2026-06-28T11:00:00Z');
  assert.equal(r.inserted, 1);
  assert.equal(r.skipped, 0);

  r = insertWorkouts(db, [sample()], '2026-06-28T12:00:00Z'); // same uuid
  assert.equal(r.inserted, 0);
  assert.equal(r.skipped, 1);
  assert.equal(listWorkouts(db).length, 1);
});

test('listWorkouts since filters by received_at', () => {
  const db = openDb(':memory:');
  insertWorkouts(db, [sample({ uuid: 'a' })], '2026-06-28T10:00:00Z');
  insertWorkouts(db, [sample({ uuid: 'b' })], '2026-06-28T12:00:00Z');
  const rows = listWorkouts(db, '2026-06-28T11:00:00Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uuid, 'b');
});

test('validateIngest rejects bad payloads', () => {
  assert.equal(validateIngest(null).ok, false);
  assert.equal(validateIngest({}).ok, false);
  assert.equal(validateIngest({ workouts: [] }).ok, false);
  // missing uuid
  assert.equal(
    validateIngest({ workouts: [{ activityType: 'x', startDate: '2026-06-28T10:00:00Z', endDate: '2026-06-28T10:00:00Z' }] }).ok,
    false,
  );
  assert.equal(validateIngest({ workouts: [sample()] }).ok, true);
});

test('validateIngest rejects bad date and numeric types', () => {
  assert.equal(validateIngest({ workouts: [sample({ startDate: 'not-a-date' })] }).ok, false);
  assert.equal(validateIngest({ workouts: [sample({ distanceM: 'far' })] }).ok, false);
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
