// Test de bout en bout du service push PHP : abonnement, planification, cron,
// signature VAPID (vérifiée) et chiffrement RFC 8291 (déchiffré avec la clé du « navigateur »).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hasPhp = (() => { try { execFileSync('php', ['-v']); return true; } catch { return false; } })();
const b64u = b => Buffer.from(b).toString('base64url');
const unb64u = s => Buffer.from(s, 'base64url');

function hkdf(salt, ikm, info, len) { return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len)); }

/** Déchiffrement RFC 8291 côté navigateur. */
function decrypt(body, uaKeys, authSecret) {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const cipher = body.subarray(21 + idlen);
  const shared = uaKeys.ecdh.computeSecret(asPublic);
  const ikm = hkdf(authSecret, shared, Buffer.concat([Buffer.from('WebPush: info\0'), uaKeys.pub, asPublic]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, 'délimiteur de dernier enregistrement');
  return JSON.parse(plain.subarray(0, plain.length - 1).toString('utf8'));
}

function verifyVapid(authHeader, expectedAud) {
  const m = /^vapid t=([^,]+), k=(.+)$/.exec(authHeader);
  assert.ok(m, 'en-tête VAPID');
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(unb64u(c));
  assert.equal(claims.aud, expectedAud);
  assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 86400);
  assert.match(claims.sub, /^(mailto:|https:)/);
  const raw = unb64u(m[2]);
  const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, unb64u(s));
  assert.ok(ok, 'signature ES256 valide');
  return m[2];
}

test('service push PHP de bout en bout', { skip: !hasPhp && 'PHP absent' }, async () => {
  const received = [];
  const mock = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => { received.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(201); res.end(); });
  });
  await new Promise(r => mock.listen(0, '127.0.0.1', r));
  const mockHost = `127.0.0.1:${mock.address().port}`;
  const dataDir = mkdtempSync(join(tmpdir(), 'somnia-push-'));
  const env = { ...process.env, SOMNIA_TEST_PUSH_HOST: mockHost, SOMNIA_DATA_DIR: dataDir };
  const port = 18000 + Math.floor(Math.random() * 1000);
  const php = spawn('php', ['-S', `127.0.0.1:${port}`, '-t', '.'], { env, stdio: 'ignore' });
  const base = `http://127.0.0.1:${port}/api/push.php`;
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(base + '?action=status'); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
    const st = await (await fetch(base + '?action=status')).json();
    assert.equal(st.ok, true);
    assert.equal(unb64u(st.publicKey).length, 65);
    assert.equal(st.cron.healthy, false);

    // « Navigateur » : clés de l'abonnement
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    const ua = { ecdh, pub: ecdh.getPublicKey() };
    const authSecret = crypto.randomBytes(16);
    const subscription = { endpoint: `http://${mockHost}/push/abc`, keys: { p256dh: b64u(ua.pub), auth: b64u(authSecret) } };
    const post = (action, body) => fetch(`${base}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, json: await r.json() }));

    const bad = await post('subscribe', { subscription: { ...subscription, endpoint: 'https://evil.example.com/x' }, tz: 'Europe/Paris' });
    assert.equal(bad.status, 400, 'hôte push non autorisé refusé');

    const sub = await post('subscribe', { subscription, tz: 'Europe/Paris' });
    assert.equal(sub.json.ok, true);
    const cred = { id: sub.json.id, token: sub.json.token };
    assert.equal((await post('schedule', { id: cred.id, token: 'faux', items: [] })).status, 404, 'jeton faux refusé');

    // Notification immédiate de test
    const t = await post('test', cred);
    assert.equal(t.json.ok, true);
    assert.equal(received.length, 1);
    verifyVapid(received[0].headers.authorization, `http://${mockHost}`);
    assert.equal(received[0].headers['content-encoding'], 'aes128gcm');
    assert.equal(decrypt(received[0].body, ua, authSecret).title, '🔔 Test Somnia');

    // Planification : une échéance passée (avec relance) et une alarme récurrente
    const sch = await post('schedule', { ...cred, items: [
      { key: 'session-1', kind: 'once', at: new Date(Date.now() - 5000).toISOString(), title: '⏰ Réveil', body: 'C\'est l\'heure.', nag: true },
      { key: 'alarm-x', kind: 'alarm', time: '07:00', days: [1, 2, 3, 4, 5], tz: 'Europe/Paris', title: '⏰ Travail', body: 'Debout', nag: true },
      { key: 'bad', kind: 'alarm', time: '25:00', days: [] },
    ] });
    assert.equal(sch.json.items.length, 2, 'élément invalide écarté');
    const alarmNext = new Date(sch.json.items.find(i => i.key === 'alarm-x').next);
    const paris = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', weekday: 'short' }).format(alarmNext);
    assert.match(paris, /07:00/);
    assert.ok(!/sam|dim/.test(paris), `jour ouvré attendu : ${paris}`);

    // (exécution asynchrone : le faux service push vit dans ce processus)
    const out1 = (await run('php', ['api/cron.php'], { env })).stdout;
    assert.equal(received.length, 2, `le cron envoie l'échéance due (${out1})`);
    const msg = decrypt(received[1].body, ua, authSecret);
    assert.equal(msg.title, '⏰ Réveil'); assert.equal(msg.tag, 'session-1');
    await run('php', ['api/cron.php'], { env });
    assert.equal(received.length, 2, 'pas de doublon au passage suivant');

    // Accusé de réception : la relance est annulée et l'élément ponctuel disparaît
    await post('ack', { ...cred, tag: 'session-1' });
    const file = readdirSync(join(dataDir, 'subs'))[0];
    const stored = JSON.parse(readFileSync(join(dataDir, 'subs', file), 'utf8'));
    assert.ok(stored.items.find(i => i.key === 'session-1').acked);
    assert.ok(!stored.items.find(i => i.key === 'session-1').nagAt);
    assert.equal(stored.endpoint, subscription.endpoint);
    assert.ok(!JSON.stringify(stored).includes(cred.token), 'le jeton n\'est jamais stocké en clair');

    const st2 = await (await fetch(base + '?action=status')).json();
    assert.equal(st2.cron.healthy, true);

    // Calendrier .ics
    const ics = await (await fetch(`http://127.0.0.1:${port}/api/ics.php?a=${encodeURIComponent('07:00|1,2,3,4,5|Travail|Europe/Paris')}&a=${encodeURIComponent('99:00||x|Mars/Base')}`)).text();
    assert.match(ics, /BEGIN:VCALENDAR/);
    assert.match(ics, /DTSTART;TZID=Europe\/Paris:\d{8}T070000/);
    assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR/);
    assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1, 'paramètre invalide ignoré');

    // Suppression
    await post('delete', cred);
    assert.equal(readdirSync(join(dataDir, 'subs')).length, 0);
  } finally {
    php.kill();
    mock.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
