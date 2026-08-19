/**
 * billParser.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Best-effort extraction of usage figures from an uploaded utility bill PDF.
 * Utility bill layouts vary wildly, so this never claims certainty — it
 * returns every plausible match it finds plus the best guess, and the
 * frontend always shows the number in an editable field so the user can
 * correct it before it's submitted.
 */

const { PDFParse } = require('pdf-parse');

// Matches things like "312 kWh", "usage: 312.5 kWh", "312kWh"
const KWH_PATTERN = /([\d,]+(?:\.\d+)?)\s*k?wh/gi;

// Matches things like "8,400 litres", "8400 L", "8.4 kL", "used 8400 gallons"
const LITRE_PATTERN = /([\d,]+(?:\.\d+)?)\s*(?:litres?|liters?|\bl\b)/gi;
const KILOLITRE_PATTERN = /([\d,]+(?:\.\d+)?)\s*k(?:ilo)?l(?:itres?|iters?)?\b/gi;
const CUBIC_METRE_PATTERN = /([\d,]+(?:\.\d+)?)\s*(?:m3|m³|cubic\s*met(?:re|er)s?|cu\.?\s*m)\b/gi;
const GALLON_PATTERN = /([\d,]+(?:\.\d+)?)\s*gal(?:lons?)?/gi;

const GALLONS_TO_LITRES = 3.78541;

// South Asian bills (NEA etc.) often say "UNITS" instead of "kWh" — no unit
// suffix at all. Detected by line context, not by pattern, since the number
// itself carries no marker.
const USAGE_KEYWORDS = /usage|consum|used this|total kwh|units used|\bunits?\b/i;
const READING_KEYWORDS = /reading|meter (?:start|end)|\brdg\b/i;
const PRESENT_READING = /(?:present|current|end)\s*(?:rdg|reading)[^\d]{0,10}([\d,]+(?:\.\d+)?)/i;
const PREVIOUS_READING = /(?:previous|start|prior)\s*(?:rdg|reading)[^\d]{0,10}([\d,]+(?:\.\d+)?)/i;
const RATE_PATTERN = /(?:rate|price)[^\d]{0,15}([\d.]+)\s*(?:\/|per)\s*(?:k?wh|unit)/i;
const ENERGY_CHARGE_PATTERN = /energy\s*charges?[^\d]{0,10}([\d,]+(?:\.\d+)?)/i;
const GENERIC_NUMBER = /([\d,]+(?:\.\d+)?)/;

// Stricter than USAGE_KEYWORDS: only quantity-labelled lines, and only when
// the line isn't a money line. "Consumption charge: $61.40" matches
// USAGE_KEYWORDS (via "consum") but is a dollar figure, not kWh — without
// this guard the bare-number fallback below would grab $61.40 as usage.
const BARE_UNIT_LABEL = /\bunits?\b|total kwh|units used/i;
const MONEY_LINE = /charge|amount|due|bill(?:ed)?|payable|total\s*(?:cost|amount)?\s*[:=]|rate|price|\$|₹|रु|rs\.?\s*\d|npr/i;

function toNumber(raw) {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Line-aware extraction: a number's line context tells us whether it's the
// actual usage figure ("Total usage: 312 kWh") or a meter reading ("Current
// reading: 1512 kWh") or a running balance — the latter two are much bigger
// than real usage and would badly overstate emissions if picked blindly.
//
// Priority tiers (higher wins):
//   3 — explicitly labelled usage/consumption/units, or a computed
//       present-minus-previous reading, or a rate×charge cross-check
//   1 — unlabelled number with the right unit (kWh/litres/etc.)
//   0 — a bare meter reading (present or previous individually — these run
//       much higher than actual usage and are the least trustworthy alone)
function extractAll(text, pattern) {
  const matches = [];
  for (const line of text.split(/\r?\n/)) {
    const re = new RegExp(pattern); // fresh instance — patterns are stateful (g flag)
    let m;
    while ((m = re.exec(line)) !== null) {
      const n = toNumber(m[1]);
      if (n === null) continue;
      matches.push({
        value: n,
        priority: USAGE_KEYWORDS.test(line) ? 3 : READING_KEYWORDS.test(line) ? 0 : 1,
      });
    }
  }
  return matches;
}

// Prefer numbers on a line explicitly labelled as usage/consumption; fall
// back to any non-meter-reading number; only fall back to meter readings
// (which run much higher than real usage) as a last resort. Never a
// guarantee — always surfaced to the user as an editable field.
function bestGuess(matches) {
  if (!matches.length) return null;
  const maxPriority = Math.max(...matches.map((m) => m.priority));
  const pool = matches.filter((m) => m.priority === maxPriority).map((m) => m.value);
  return Math.min(...pool); // among equally-labelled candidates, smallest is safer than largest
}

// Electricity gets two extra strategies beyond the generic kWh regex, because
// many bills (Nepal Electricity Authority and similar) never print "kWh" at
// all — they use "UNITS" and expect you to subtract two meter readings.
function extractElectricity(text) {
  const lines = text.split(/\r?\n/);
  const matches = extractAll(text, KWH_PATTERN);

  // Strategy: bare "UNITS: 106" style lines with no kWh suffix — only look
  // for a number when the line is clearly labelled AND isn't a money line
  // ("Consumption charge: $61.40" should never be read as 61.4 kWh).
  for (const line of lines) {
    if (!BARE_UNIT_LABEL.test(line)) continue;
    if (MONEY_LINE.test(line)) continue;
    if (new RegExp(KWH_PATTERN).test(line)) continue; // already caught above
    const gm = GENERIC_NUMBER.exec(line);
    if (gm) {
      const n = toNumber(gm[1]);
      if (n !== null) matches.push({ value: n, priority: 3, source: 'units_label' });
    }
  }

  // Strategy: present reading − previous reading = actual usage. This is
  // the number NEA-style bills expect you to compute yourself. Scanned
  // line-by-line and skipped on any line mentioning litres/gallons, so a
  // water bill's meter readings never get mistaken for kWh.
  let readingDiff = null;
  let present = null;
  let previous = null;
  const WATER_UNIT_HINT = /litres?|liters?|gallons?|\bl\b|\bgal\b/i;
  for (const line of lines) {
    if (WATER_UNIT_HINT.test(line)) continue;
    const presentM = PRESENT_READING.exec(line);
    if (presentM) present = toNumber(presentM[1]);
    const previousM = PREVIOUS_READING.exec(line);
    if (previousM) previous = toNumber(previousM[1]);
  }
  if (present !== null && previous !== null && present >= previous) {
    readingDiff = present - previous;
    matches.push({ value: readingDiff, priority: 3, source: 'reading_diff' });
  }

  // Strategy: cross-check via rate × usage = charge, rearranged to
  // charge ÷ rate = usage. Only used when the bill actually prints a
  // per-unit rate — flat-rate/slab-tariff bills (like NEA) won't have one,
  // so this quietly does nothing rather than guessing.
  let rateDerived = null;
  const rateM = RATE_PATTERN.exec(text);
  const chargeM = ENERGY_CHARGE_PATTERN.exec(text);
  if (rateM && chargeM) {
    const rate = toNumber(rateM[1]);
    const charge = toNumber(chargeM[1]);
    if (rate && charge) {
      rateDerived = Math.round(charge / rate);
      matches.push({ value: rateDerived, priority: 1, source: 'rate_derived' });
    }
  }

  return { matches, readingDiff, rateDerived };
}

async function parseBillBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });
  const { text } = await parser.getText();
  await parser.destroy();

  const { matches: kwhMatches, readingDiff, rateDerived } = extractElectricity(text);

  const litreMatches = extractAll(text, LITRE_PATTERN);
  const kilolitreMatches = extractAll(text, KILOLITRE_PATTERN).map((m) => ({ ...m, value: m.value * 1000 }));
  const cubicMetreMatches = extractAll(text, CUBIC_METRE_PATTERN).map((m) => ({ ...m, value: m.value * 1000 })); // 1 m³ = 1000 L
  const gallonMatches = extractAll(text, GALLON_PATTERN).map((m) => ({ ...m, value: m.value * GALLONS_TO_LITRES }));
  const allLitreMatches = [...litreMatches, ...kilolitreMatches, ...cubicMetreMatches, ...gallonMatches];

  const guessKwh = bestGuess(kwhMatches);
  const guessLitres = bestGuess(allLitreMatches);

  return {
    electricityKwh: guessKwh,
    electricityCandidates: kwhMatches.map((m) => m.value),
    electricityReadingDiff: readingDiff,   // present − previous meter reading, if both were found
    electricityRateDerived: rateDerived,   // energy charge ÷ per-unit rate, if the bill prints a flat rate
    waterLitres: guessLitres === null ? null : Math.round(guessLitres),
    waterCandidates: allLitreMatches.map((m) => Math.round(m.value)),
    charCount: text.length,
  };
}

module.exports = { parseBillBuffer };
