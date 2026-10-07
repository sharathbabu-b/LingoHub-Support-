// Weekly schedule maths.
//
// A week is 336 half-hour "slots" in UTC, indexed Monday 00:00 UTC = 0.
// Half-hour resolution lets us represent zones like India (+5:30) exactly.
// UI grids are hourly (7 x 24) in a person's own timezone and are converted here.

const SLOT_MIN = 30;
const SLOTS_PER_HOUR = 2;
const SLOTS_PER_DAY = 48;
const SLOTS_PER_WEEK = 336;
const MIN_PER_WEEK = 7 * 24 * 60;

function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Offset (minutes) of `tz` from UTC at `date`: local = utc + offset.
function tzOffsetMinutes(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const realUtc = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - realUtc) / 60000);
}

// Round to nearest 30 min so every offset lands on the slot grid.
const slotOffset = (tz, date) => Math.round(tzOffsetMinutes(tz, date) / SLOT_MIN) * SLOT_MIN;

const mod = (n, m) => ((n % m) + m) % m;

// grid: [{day: 0..6 (Mon..Sun), hour: 0..23}] in local time of `tz` -> sorted unique UTC slots
function gridToUtcSlots(grid, tz, date = new Date()) {
  const off = slotOffset(tz, date);
  const out = new Set();
  for (const { day, hour } of grid) {
    if (!Number.isInteger(day) || !Number.isInteger(hour) || day < 0 || day > 6 || hour < 0 || hour > 23) continue;
    const localMin = day * 1440 + hour * 60;
    for (let k = 0; k < SLOTS_PER_HOUR; k++) {
      const utcMin = mod(localMin + k * SLOT_MIN - off, MIN_PER_WEEK);
      out.add(utcMin / SLOT_MIN);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// UTC slots -> hourly grid in `tz`. An hour is "on" only if both of its half-hours are in the set.
function utcSlotsToGrid(slots, tz, date = new Date()) {
  const off = slotOffset(tz, date);
  const set = new Set(slots);
  const grid = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const localMin = day * 1440 + hour * 60;
      let all = true;
      for (let k = 0; k < SLOTS_PER_HOUR; k++) {
        const utcSlot = mod(localMin + k * SLOT_MIN - off, MIN_PER_WEEK) / SLOT_MIN;
        if (!set.has(utcSlot)) all = false;
      }
      if (all) grid.push({ day, hour });
    }
  }
  return grid;
}

// Slot index for an instant (UTC, Monday-based).
function slotAt(date = new Date()) {
  const day = (date.getUTCDay() + 6) % 7;
  return day * SLOTS_PER_DAY + date.getUTCHours() * 2 + (date.getUTCMinutes() >= 30 ? 1 : 0);
}

const intersect = (a, b) => {
  const sb = new Set(b);
  return a.filter((x) => sb.has(x));
};
const subtract = (a, b) => {
  const sb = new Set(b);
  return a.filter((x) => !sb.has(x));
};
const union = (...lists) => [...new Set(lists.flat())].sort((a, b) => a - b);
const hoursOf = (slots) => slots.length / SLOTS_PER_HOUR;

// Count how many people cover each slot -> hourly heat grid in `tz`.
// An hour's count is the minimum across its two half-hour slots (a gap in either half is a gap).
function coverageHeat(slotLists, tz, date = new Date()) {
  const counts = new Array(SLOTS_PER_WEEK).fill(0);
  for (const list of slotLists) for (const s of list) if (s >= 0 && s < SLOTS_PER_WEEK) counts[s]++;
  const off = slotOffset(tz, date);
  const cells = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const localMin = day * 1440 + hour * 60;
      const a = counts[mod(localMin - off, MIN_PER_WEEK) / SLOT_MIN];
      const b = counts[mod(localMin + SLOT_MIN - off, MIN_PER_WEEK) / SLOT_MIN];
      cells.push({ day, hour, count: Math.min(a, b) });
    }
  }
  return cells;
}

module.exports = {
  SLOT_MIN, SLOTS_PER_DAY, SLOTS_PER_WEEK,
  isValidTimezone, tzOffsetMinutes, gridToUtcSlots, utcSlotsToGrid, slotAt,
  intersect, subtract, union, hoursOf, coverageHeat,
};
