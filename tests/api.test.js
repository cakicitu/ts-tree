import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/index.js';

// Inject Node request streams into the real HTTP handler without opening a port.
function request(app, url, { method = 'GET', data, cookie, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const req = Readable.from(raw !== undefined ? [Buffer.from(raw)] : data !== undefined ? [Buffer.from(JSON.stringify(data))] : []);
    Object.assign(req, { url, method, headers: { host: 'localhost', ...(data !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers }, socket: { remoteAddress: '127.0.0.1' } });
    const responseHeaders = {};
    const res = {
      setHeader(name, value) { responseHeaders[name.toLowerCase()] = value; },
      writeHead(status, values) { this.status = status; for (const [key, value] of Object.entries(values)) this.setHeader(key, value); },
      end(content) {
        const text = content?.toString() || '';
        resolve({ status: this.status, headers: responseHeaders, body: responseHeaders['content-type']?.includes('application/json') ? JSON.parse(text) : text });
      },
    };
    req.on('error', reject);
    app.emit('request', req, res);
  });
}
const quiet = () => {};
function fixture(t, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-test-'));
  const app = createApp({ dataDir, sendMail: quiet, ...options });
  t.after(() => { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); });
  return { app, dataDir };
}
const sessionCookie = response => response.headers['set-cookie'].split(';')[0];
async function register(app, email = 'anna@example.com', password = 'Geheim123') {
  const response = await request(app, '/api/register', { method: 'POST', data: { email, password } });
  assert.equal(response.status, 201);
  return sessionCookie(response);
}
async function login(app, email = 'anna@example.com', password = 'Geheim123') {
  const response = await request(app, '/api/login', { method: 'POST', data: { email, password } });
  assert.equal(response.status, 200);
  return sessionCookie(response);
}
const names = Array.from({ length: 10 }, (_, i) => `Spieler ${i + 1}`);

test('Login erforderlich, falsches Passwort, E-Mail ohne Groß-/Kleinschreibung, sichere Sitzung und Abmelden', async t => {
  const { app } = fixture(t, { cookieSecure: true });
  for (const [url, method] of [['/api/tournament', 'GET'], ['/api/tournament', 'POST'], ['/api/tournament', 'DELETE'], ['/api/tournament/winner', 'POST']]) {
    assert.equal((await request(app, url, { method, data: {} })).status, 401);
  }
  await register(app);
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { email: 'anna@example.com', password: 'falsch' } })).status, 401);
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { email: 'niemand@example.com', password: 'Geheim123' } })).status, 401);
  const response = await request(app, '/api/login', { method: 'POST', data: { email: ' Anna@Example.com ', password: 'Geheim123' } });
  assert.match(response.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(response.headers['set-cookie'], /; Secure/);
  const cookie = response.headers['set-cookie'].split(';')[0];
  assert.equal((await request(app, '/api/session', { cookie })).body.email, 'anna@example.com');
  assert.equal((await request(app, '/api/logout', { method: 'POST', cookie, data: {} })).status, 200);
  assert.equal((await request(app, '/api/session', { cookie })).status, 401);
});

test('Turnier anlegen, Sieger speichern, Konflikte abweisen, löschen und neu anlegen', async t => {
  const { app } = fixture(t);
  const cookie = await register(app);
  assert.deepEqual((await request(app, '/api/tournament', { cookie })).body, { tournament: null, version: 0 });
  const created = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
  assert.equal(created.status, 201);
  assert.equal(created.body.tournament.players.length, 10);
  assert.equal((await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 1 } })).status, 409);
  assert.equal((await request(app, '/api/tournament', { method: 'DELETE', cookie, data: { version: 0 } })).status, 409);
  const won = await request(app, '/api/tournament/winner', { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 1 } });
  assert.equal(won.status, 200);
  assert.equal(won.body.tournament.results['0-1'], 'p8');
  const deleted = await request(app, '/api/tournament', { method: 'DELETE', cookie, data: { version: 2 } });
  assert.deepEqual(deleted.body, { tournament: null, version: 3 });
  const fresh = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names: names.slice(0, 4), version: 3 } });
  assert.equal(fresh.status, 201);
  assert.equal(fresh.body.tournament.players.length, 4);
  assert.deepEqual(fresh.body.tournament.results, {});
});

test('SQLite erhält Konto, Turnier und Sitzung nach Neustart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-restart-'));
  let app = createApp({ dataDir, sendMail: quiet });
  try {
    const cookie = await register(app);
    await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
    await request(app, '/api/tournament/winner', { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 1 } });
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    const stored = await request(app, '/api/tournament', { cookie });
    assert.equal(stored.status, 200);
    assert.equal(stored.body.tournament.results['0-1'], 'p8');
    const newCookie = await login(app);
    assert.equal((await request(app, '/api/tournament', { cookie: newCookie })).body.tournament.players.length, 10);
  } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
});

test('Eingabevalidierung, JSON-Limit und Schutz gegen fremde Origins', async t => {
  const { app } = fixture(t);
  const cookie = await register(app);
  const mutate = data => request(app, '/api/tournament', { method: 'POST', cookie, data });
  assert.equal((await mutate({ names: ['nur einer'], version: 0 })).status, 400);
  assert.equal((await mutate({ names: names.slice(0, 3), version: 0 })).status, 400);
  assert.equal((await mutate({ names: [...names.slice(0, 7), ' '], version: 0 })).status, 400);
  assert.equal((await request(app, '/api/tournament', { method: 'POST', cookie, raw: '{kaputt' })).status, 400);
  assert.equal((await request(app, '/api/tournament', { method: 'POST', cookie, raw: 'x'.repeat(17000) })).status, 413);
  assert.equal((await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 }, headers: { origin: 'https://example.com' } })).status, 403);
  assert.equal((await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 }, headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await mutate({ names, version: 0 })).status, 201);
});

test('Wiederholte falsche Anmeldungen werden begrenzt', async t => {
  const { app } = fixture(t);
  await register(app);
  for (let i = 0; i < 10; i++) assert.equal((await request(app, '/api/login', { method: 'POST', data: { email: 'anna@example.com', password: 'falsch' } })).status, 401);
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { email: 'anna@example.com', password: 'Geheim123' } })).status, 429);
});

test('Statische Dateien: HTML/Assets erreichbar, Datenbank und Quellcode nicht', async t => {
  const distDir = mkdtempSync(join(tmpdir(), 'ts-tree-dist-'));
  t.after(() => rmSync(distDir, { recursive: true, force: true }));
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'index.html'), '<html lang="de">Ts-Tree</html>');
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("Ts-Tree")');
  const { app } = fixture(t, { distDir });
  assert.equal((await request(app, '/')).status, 200);
  assert.equal((await request(app, '/tree/123456')).body, '<html lang="de">Ts-Tree</html>');
  assert.equal((await request(app, '/tree/123456/')).status, 200);
  assert.equal((await request(app, '/reset-password?token=abc')).status, 200);
  assert.match((await request(app, '/assets/app.js')).headers['content-type'], /javascript/);
  for (const path of ['/data/tournament.sqlite', '/server/index.js', '/..%2fpackage.json']) assert.equal((await request(app, path)).status, 404);
});

test('Öffentlicher Code erlaubt Lesen ohne Login, aber keine Änderungen', async t => {
  const { app } = fixture(t);
  assert.equal((await request(app, '/api/tree/123456')).status, 404);
  const cookie = await register(app);
  const created = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
  const code = created.body.tournament.code;
  assert.match(code, /^\d{6}$/);
  const shared = await request(app, `/api/tree/${code}`);
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.body.tournament, created.body.tournament);
  assert.equal(shared.body.version, undefined);
  assert.equal(shared.headers['set-cookie'], undefined);
  assert.equal(shared.headers['cache-control'], 'no-store');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await request(app, `/api/tree/${code}`, { method, data: { playerId: 'p8' } })).status, 405);
  }
  for (const [url, method] of [['/api/tournament', 'POST'], ['/api/tournament', 'DELETE'], ['/api/tournament/winner', 'POST']]) {
    assert.equal((await request(app, url, { method, data: { code, version: 1, matchId: '0-1', playerId: 'p8' } })).status, 401);
  }
  for (const invalid of ['12345', '1234567', 'abcdef', `${code}/winner`]) {
    assert.equal((await request(app, `/api/tree/${invalid}`)).status, 404);
  }
  await request(app, '/api/tournament/winner', { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 1 } });
  const updated = await request(app, `/api/tree/${code}`);
  assert.equal(updated.body.tournament.results['0-1'], 'p8');
  assert.equal(updated.body.tournament.code, code);
});

test('Gelöschte Codes bleiben über Neustarts reserviert und zeigen kein neues Turnier', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-codes-'));
  let app = createApp({ dataDir, sendMail: quiet });
  try {
    let cookie = await register(app);
    const first = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
    const firstCode = first.body.tournament.code;
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).body.tournament.code, firstCode);
    cookie = await login(app);
    await request(app, '/api/tournament', { method: 'DELETE', cookie, data: { version: 1 } });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).status, 404);
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    const second = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 2 } });
    assert.equal(second.status, 201);
    assert.notEqual(second.body.tournament.code, firstCode);
    assert.equal((await request(app, `/api/tree/${firstCode}`)).status, 404);
    assert.equal((await request(app, `/api/tree/${second.body.tournament.code}`)).status, 200);
    const db = new DatabaseSync(join(dataDir, 'tournament.sqlite'));
    try {
      const codes = db.prepare('SELECT code FROM issued_codes').all().map(row => row.code);
      assert.equal(codes.length, 2);
      assert.ok(codes.includes(firstCode));
      assert.ok(codes.includes(second.body.tournament.code));
    } finally { db.close(); }
  } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
});

test('Registrierung prüft Eingaben und lehnt doppelte Adressen ab', async t => {
  const { app } = fixture(t);
  const registerWith = data => request(app, '/api/register', { method: 'POST', data });
  assert.equal((await registerWith({ email: 'kein-at', password: 'Geheim123' })).status, 400);
  assert.equal((await registerWith({ email: 'anna@example.com', password: 'kurz' })).status, 400);
  assert.equal((await registerWith({ email: 'anna@example.com', password: 'x'.repeat(257) })).status, 400);
  await register(app);
  assert.equal((await registerWith({ email: 'ANNA@example.com', password: 'Anderes123' })).status, 409);
});

test('Jedes Konto hat sein eigenes Turnier', async t => {
  const { app } = fixture(t);
  const anna = await register(app, 'anna@example.com');
  const ben = await register(app, 'ben@example.com');
  const annas = await request(app, '/api/tournament', { method: 'POST', cookie: anna, data: { names, version: 0 } });
  assert.equal(annas.status, 201);
  assert.deepEqual((await request(app, '/api/tournament', { cookie: ben })).body, { tournament: null, version: 0 });
  const bens = await request(app, '/api/tournament', { method: 'POST', cookie: ben, data: { names: names.slice(0, 4), version: 0 } });
  assert.equal(bens.status, 201);
  assert.notEqual(bens.body.tournament.code, annas.body.tournament.code);
  assert.equal((await request(app, `/api/tree/${annas.body.tournament.code}`)).body.tournament.players.length, 10);
  assert.equal((await request(app, `/api/tree/${bens.body.tournament.code}`)).body.tournament.players.length, 4);
  await request(app, '/api/tournament', { method: 'DELETE', cookie: ben, data: { version: 1 } });
  assert.equal((await request(app, '/api/tournament', { cookie: anna })).body.tournament.players.length, 10);
});

test('Passwort vergessen: Mail mit Einmal-Link, alte Sitzungen enden, Antwort verrät keine Konten', async t => {
  const mails = [];
  const { app } = fixture(t, { sendMail: mail => mails.push(mail), appUrl: 'https://example.com/ts-tree' });
  const oldCookie = await register(app);
  const forgot = email => request(app, '/api/forgot-password', { method: 'POST', data: { email } });
  assert.equal((await forgot('niemand@example.com')).status, 200);
  assert.equal(mails.length, 0);
  assert.equal((await forgot('Anna@example.com')).status, 200);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'anna@example.com');
  const token = mails[0].text.match(/https:\/\/example\.com\/ts-tree\/reset-password\?token=([a-f0-9]{64})/)[1];
  assert.ok(mails[0].html.includes(token));
  await forgot('anna@example.com');
  assert.equal(mails.length, 1, 'zweite Anfrage innerhalb einer Minute verschickt keine weitere Mail');
  const reset = data => request(app, '/api/reset-password', { method: 'POST', data });
  assert.equal((await reset({ token: 'f'.repeat(64), password: 'NeuesPasswort1' })).status, 400);
  assert.equal((await reset({ token, password: 'kurz' })).status, 400);
  const done = await reset({ token, password: 'NeuesPasswort1' });
  assert.equal(done.status, 200);
  assert.equal(done.body.email, 'anna@example.com');
  assert.equal((await request(app, '/api/session', { cookie: sessionCookie(done) })).status, 200);
  assert.equal((await request(app, '/api/session', { cookie: oldCookie })).status, 401);
  assert.equal((await reset({ token, password: 'NochEinsNeu1' })).status, 400);
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { email: 'anna@example.com', password: 'Geheim123' } })).status, 401);
  await login(app, 'anna@example.com', 'NeuesPasswort1');
});
