import test from 'node:test';
import assert from 'node:assert/strict';
import { createAlarmEngine } from '../js/alarm/engine.js';
import { createRepo } from '../js/data/repo.js';
import { memoryAdapter } from '../js/data/db.js';
import { buildICS } from '../js/alarm/ics.js';
import { buildSchedule } from '../js/alarm/push.js';

async function setup(t0) {
  const repo = await createRepo(memoryAdapter()).init();
  let now = t0;
  const rings = [];
  const engine = createAlarmEngine({ repo, clock: () => now, onRing: r => rings.push(r) });
  return { repo, engine, rings, set: v => { now = v; } };
}

test('alarme de session : sonne à l\'heure, pas avant', async () => {
  const t0 = Date.parse('2026-10-28T22:00:00Z');
  const { repo, engine, rings, set } = await setup(t0);
  await repo.setSession({ id: 's', tz: 'Europe/Paris', startedAt: new Date(t0).toISOString(), alarm: { enabled: true, plannedAt: '2026-10-29T06:00:00Z', snoozeMin: 9, sound: 'aube' }, events: [] });
  await engine.check();
  assert.equal(rings.length, 0);
  set(Date.parse('2026-10-29T06:00:01Z'));
  await engine.check();
  assert.equal(rings.length, 1);
  assert.equal(rings[0].late, false);
  assert.ok(repo.session.alarm.rangAt);
  assert.equal(repo.alarmLog[0].kind, 'ring');
});

test('app suspendue : l\'alarme sonne au retour et le retard est enregistré', async () => {
  const { repo, engine, rings, set } = await setup(Date.parse('2026-10-29T06:20:00Z'));
  await repo.setSession({ id: 's', tz: 'Europe/Paris', startedAt: '2026-10-28T22:00:00Z', alarm: { enabled: true, plannedAt: '2026-10-29T06:00:00Z' }, events: [] });
  await engine.check();
  assert.equal(rings[0].late, true);
  assert.equal(rings[0].lateSec, 1200);
  assert.equal(repo.session.alarm.lateSec, 1200);
});

test('répétition puis arrêt', async () => {
  const { repo, engine, rings, set } = await setup(Date.parse('2026-10-29T06:00:00Z'));
  await repo.setSession({ id: 's', tz: 'Europe/Paris', startedAt: '2026-10-28T22:00:00Z', alarm: { enabled: true, plannedAt: '2026-10-29T06:00:00Z', snoozeMin: 9 }, events: [] });
  await engine.check();
  const next = await engine.snooze();
  assert.equal(next, '2026-10-29T06:09:00.000Z');
  assert.equal(repo.session.alarm.snoozes, 1);
  set(Date.parse('2026-10-29T06:05:00Z')); await engine.check();
  assert.equal(rings.length, 1, 'pas de sonnerie pendant la répétition');
  set(Date.parse('2026-10-29T06:09:00Z')); await engine.check();
  assert.equal(rings.length, 2);
  const r = await engine.dismiss();
  assert.equal(r.kind, 'session');
  assert.ok(repo.session.alarm.dismissedAt);
  set(Date.parse('2026-10-29T06:30:00Z')); await engine.check();
  assert.equal(rings.length, 2, 'plus de sonnerie après l\'arrêt');
  assert.deepEqual(repo.alarmLog.map(l => l.kind), ['dismiss', 'ring', 'snooze', 'ring']);
});

test('alarme récurrente : sonne une seule fois par occurrence, uniquement les jours choisis', async () => {
  // Mercredi 28 octobre 2026, 07:00 à Paris = 06:00 UTC
  const { repo, engine, rings, set } = await setup(Date.parse('2026-10-28T06:00:30Z'));
  await repo.saveAlarm({ id: 'a', time: '07:00', days: [1, 2, 3, 4, 5], enabled: true, tz: 'Europe/Paris', label: 'Travail' });
  await engine.check(); assert.equal(rings.length, 1);
  await engine.dismiss();
  await engine.check(); assert.equal(rings.length, 1, 'pas de doublon');
  set(Date.parse('2026-10-31T06:00:30Z')); // samedi
  await engine.check(); assert.equal(rings.length, 1, 'pas le samedi');
  set(Date.parse('2026-11-02T06:00:30Z')); // lundi (heure d'hiver : 07:00 = 06:00 UTC)
  await engine.check(); assert.equal(rings.length, 2);
});

test('export calendrier (.ics) et planning push', async () => {
  const ics = buildICS([{ id: 'a', label: 'Travail', time: '07:15', days: [1, 2, 3, 4, 5], tz: 'Europe/Paris' }], '2026-10-29');
  assert.match(ics, /DTSTART;TZID=Europe\/Paris:20261029T071500/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY/);
  const repo = await createRepo(memoryAdapter()).init();
  await repo.saveAlarm({ id: 'a', time: '07:00', days: [], enabled: true, tz: 'Europe/Paris', label: 'X' });
  await repo.saveAlarm({ id: 'b', time: '08:00', days: [], enabled: false, tz: 'Europe/Paris', label: 'Y' });
  await repo.setSession({ id: 's', alarm: { enabled: true, plannedAt: '2026-10-29T06:00:00Z' } });
  const items = buildSchedule(repo);
  assert.deepEqual(items.map(i => i.key), ['alarm-a', 'session-s']);
  assert.ok(items.every(i => !('episodes' in i)), 'aucune donnée de sommeil');
});
