// Validate an /ingest request body. Never trust external input.
export function validateIngest(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.workouts)) {
    return { ok: false, error: 'body.workouts must be an array' };
  }
  if (body.workouts.length === 0) {
    return { ok: false, error: 'workouts is empty' };
  }
  if (body.workouts.length > 1000) {
    return { ok: false, error: 'too many workouts in one request (max 1000)' };
  }
  for (const [i, w] of body.workouts.entries()) {
    const err = validateWorkout(w);
    if (err) return { ok: false, error: `workouts[${i}]: ${err}` };
  }
  return { ok: true };
}

function validateWorkout(w) {
  if (!w || typeof w !== 'object') return 'must be an object';
  if (typeof w.uuid !== 'string' || !w.uuid) return 'uuid (string) required';
  if (typeof w.activityType !== 'string' || !w.activityType) return 'activityType (string) required';
  if (!isIso(w.startDate)) return 'startDate must be an ISO8601 string';
  if (!isIso(w.endDate)) return 'endDate must be an ISO8601 string';
  for (const k of ['durationSec', 'distanceM', 'energyKcal']) {
    if (w[k] != null && typeof w[k] !== 'number') return `${k} must be a number`;
  }
  if (w.source != null && typeof w.source !== 'string') return 'source must be a string';
  return null;
}

function isIso(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}
