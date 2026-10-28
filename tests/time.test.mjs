import test from 'node:test';
import assert from 'node:assert/strict';
import { zonedToMs, zonedParts, clockMinutes, minutesBetween, nextOccurrence, addDays, daysBetweenKeys, parseHHMM, formatHHMM, tzOffsetMinutes } from '../js/core/time.js';

test('heure locale → instant UTC (hiver et été à Paris)', () => {
  assert.equal(new Date(zonedToMs('2026-01-15', '23:00', 'Europe/Paris')).toISOString(), '2026-01-15T22:00:00.000Z');
  assert.equal(new Date(zonedToMs('2026-07-15', '23:00', 'Europe/Paris')).toISOString(), '2026-07-15T21:00:00.000Z');
  assert.equal(new Date(zonedToMs('2026-07-15', '07:00', 'America/New_York')).toISOString(), '2026-07-15T11:00:00.000Z');
});

test('heure sautée au passage à l\'heure d\'été : avance d\'une heure', () => {
  const ms = zonedToMs('2026-03-29', '02:30', 'Europe/Paris');
  assert.equal(new Date(ms).toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(zonedParts(ms, 'Europe/Paris').minutesOfDay, 3 * 60 + 30);
});

test('heure ambiguë au passage à l\'heure d\'hiver : première occurrence', () => {
  assert.equal(new Date(zonedToMs('2026-10-25', '02:30', 'Europe/Paris')).toISOString(), '2026-10-25T00:30:00.000Z');
});

test('décalage horaire', () => {
  assert.equal(tzOffsetMinutes(Date.UTC(2026, 0, 1), 'Europe/Paris'), 60);
  assert.equal(tzOffsetMinutes(Date.UTC(2026, 6, 1), 'Europe/Paris'), 120);
  assert.equal(tzOffsetMinutes(Date.UTC(2026, 6, 1), 'Asia/Kolkata'), 330);
});

test('heure d\'horloge dans le fuseau de l\'épisode, pas celui de l\'appareil', () => {
  const ms = Date.parse('2026-05-01T03:15:00Z');
  assert.equal(clockMinutes(ms, 'Europe/Paris'), 5 * 60 + 15);
  assert.equal(clockMinutes(ms, 'America/Los_Angeles'), 20 * 60 + 15);
});

test('durées entre instants', () => {
  assert.equal(minutesBetween('2026-01-01T22:00:00Z', '2026-01-02T06:30:00Z'), 510);
  assert.equal(minutesBetween(null, '2026-01-02T06:30:00Z'), null);
});

test('prochaine occurrence d\'une alarme récurrente', () => {
  // Mercredi 28 octobre 2026, 08:00 à Paris → alarme 07:00 en semaine (lun–ven) → jeudi 29.
  const from = zonedToMs('2026-10-28', '08:00', 'Europe/Paris');
  const next = nextOccurrence('07:00', from, 'Europe/Paris', [1, 2, 3, 4, 5]);
  assert.equal(zonedParts(next, 'Europe/Paris').dateKey, '2026-10-29');
  // Vendredi 30 à 08:00 → lundi 2 novembre.
  const fri = zonedToMs('2026-10-30', '08:00', 'Europe/Paris');
  assert.equal(zonedParts(nextOccurrence('07:00', fri, 'Europe/Paris', [1, 2, 3, 4, 5]), 'Europe/Paris').dateKey, '2026-11-02');
  // Alarme non récurrente plus tard le même jour.
  const today = nextOccurrence('22:00', from, 'Europe/Paris', []);
  assert.equal(zonedParts(today, 'Europe/Paris').dateKey, '2026-10-28');
});

test('arithmétique des dates et formats', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(daysBetweenKeys('2026-01-01', '2026-12-31'), 364);
  assert.equal(parseHHMM('7:05'), 425);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(formatHHMM(-30), '23:30');
  assert.equal(formatHHMM(1500), '01:00');
  assert.equal(formatHHMM(null), '—');
});
