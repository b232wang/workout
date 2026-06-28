// Validate an /ingest request body (the export envelope). Never trust external input.
export function validateIngest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'body must be a JSON object' };
  }
  const { data } = body;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'body.data must be an object' };
  }

  const groups = {
    workouts: validateWorkout,
    quantitySamples: validateQuantitySample,
    sleepSamples: validateSleepSample,
  };

  let total = 0;
  for (const [key, validateItem] of Object.entries(groups)) {
    const arr = data[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) return { ok: false, error: `data.${key} must be an array` };
    total += arr.length;
    for (const [i, item] of arr.entries()) {
      const err = validateItem(item);
      if (err) return { ok: false, error: `data.${key}[${i}]: ${err}` };
    }
  }

  if (total === 0) return { ok: false, error: 'envelope contains no samples' };
  if (total > 10000) return { ok: false, error: 'too many samples in one request (max 10000)' };

  return { ok: true };
}

// uuid + start/end + optional source — shared by every sample type.
function validateCommon(x) {
  if (!x || typeof x !== 'object') return 'must be an object';
  if (typeof x.uuid !== 'string' || !x.uuid) return 'uuid (string) required';
  if (!isIso(x.startDate)) return 'startDate must be an ISO8601 string';
  if (!isIso(x.endDate)) return 'endDate must be an ISO8601 string';
  if (x.source != null && typeof x.source !== 'string') return 'source must be a string';
  return null;
}

function validateWorkout(w) {
  return (
    validateCommon(w) ||
    (typeof w.activityType !== 'string' || !w.activityType ? 'activityType (string) required' : null) ||
    badNumber(w, ['durationSec', 'distanceM', 'energyKcal'])
  );
}

function validateQuantitySample(s) {
  return (
    validateCommon(s) ||
    (typeof s.type !== 'string' || !s.type ? 'type (string) required' : null) ||
    (typeof s.value !== 'number' ? 'value (number) required' : null) ||
    (typeof s.unit !== 'string' || !s.unit ? 'unit (string) required' : null)
  );
}

function validateSleepSample(s) {
  return validateCommon(s) || (typeof s.stage !== 'string' || !s.stage ? 'stage (string) required' : null);
}

function badNumber(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && typeof obj[k] !== 'number') return `${k} must be a number`;
  }
  return null;
}

function isIso(s) {
  return typeof s === 'string' && !Number.isNaN(Date.parse(s));
}
