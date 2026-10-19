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
function fixture(t, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-test-'));
  const app = createApp({ dataDir, ...options });
  t.after(() => { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); });
  return { app, dataDir };
}
async function login(app, password = 'PadelTurnier') {
  const response = await request(app, '/api/login', { method: 'POST', data: { username: 'admin', password } });
  assert.equal(response.status, 200);
  return response.headers['set-cookie'].split(';')[0];
}
const names = Array.from({ length: 10 }, (_, i) => `Spieler ${i + 1}`);

test('Login erforderlich, falsches Passwort, sichere Sitzung und Abmelden', async t => {
  const { app } = fixture(t, { cookieSecure: true });
  for (const [url, method] of [['/api/tournament', 'GET'], ['/api/tournament', 'POST'], ['/api/tournament', 'DELETE'], ['/api/tournament/winner', 'POST']]) {
    assert.equal((await request(app, url, { method, data: {} })).status, 401);
  }
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { username: 'admin', password: 'falsch' } })).status, 401);
  const response = await request(app, '/api/login', { method: 'POST', data: { username: 'admin', password: 'PadelTurnier' } });
  assert.match(response.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(response.headers['set-cookie'], /; Secure/);
  const cookie = response.headers['set-cookie'].split(';')[0];
  assert.equal((await request(app, '/api/session', { cookie })).body.username, 'admin');
  assert.equal((await request(app, '/api/logout', { method: 'POST', cookie, data: {} })).status, 200);
  assert.equal((await request(app, '/api/session', { cookie })).status, 401);
});

test('Turnier anlegen, Sieger speichern, Konflikte abweisen, löschen und neu anlegen', async t => {
  const { app } = fixture(t);
  const cookie = await login(app);
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

test('SQLite erhält Turnier und Sitzung nach Neustart; neue Zugangsdaten widerrufen alte Sitzungen', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-restart-'));
  let app = createApp({ dataDir });
  try {
    const cookie = await login(app);
    await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
    await request(app, '/api/tournament/winner', { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 1 } });
    app.emit('close');
    app = createApp({ dataDir });
    const stored = await request(app, '/api/tournament', { cookie });
    assert.equal(stored.status, 200);
    assert.equal(stored.body.tournament.results['0-1'], 'p8');
    app.emit('close');
    app = createApp({ dataDir, password: 'NeuesPasswort' });
    assert.equal((await request(app, '/api/session', { cookie })).status, 401);
    const newCookie = await login(app, 'NeuesPasswort');
    assert.equal((await request(app, '/api/tournament', { cookie: newCookie })).body.tournament.players.length, 10);
  } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
});

test('Eingabevalidierung, JSON-Limit und Schutz gegen fremde Origins', async t => {
  const { app } = fixture(t);
  const cookie = await login(app);
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
  for (let i = 0; i < 10; i++) assert.equal((await request(app, '/api/login', { method: 'POST', data: { username: 'admin', password: 'falsch' } })).status, 401);
  assert.equal((await request(app, '/api/login', { method: 'POST', data: { username: 'admin', password: 'PadelTurnier' } })).status, 429);
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
  assert.match((await request(app, '/assets/app.js')).headers['content-type'], /javascript/);
  for (const path of ['/data/tournament.sqlite', '/server/index.js', '/..%2fpackage.json']) assert.equal((await request(app, path)).status, 404);
});

test('Öffentlicher Code erlaubt Lesen ohne Login, aber keine Änderungen', async t => {
  const { app } = fixture(t);
  assert.equal((await request(app, '/api/tree/123456')).status, 404);
  const cookie = await login(app);
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
  let app = createApp({ dataDir });
  try {
    let cookie = await login(app);
    const first = await request(app, '/api/tournament', { method: 'POST', cookie, data: { names, version: 0 } });
    const firstCode = first.body.tournament.code;
    app.emit('close');
    app = createApp({ dataDir });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).body.tournament.code, firstCode);
    cookie = await login(app);
    await request(app, '/api/tournament', { method: 'DELETE', cookie, data: { version: 1 } });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).status, 404);
    app.emit('close');
    app = createApp({ dataDir });
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

for (const existingCode of [undefined, '001234']) {
  test(`Bestehendes Turnier migrieren: ${existingCode ? 'führende Nullen erhalten' : 'Code ergänzen und Ergebnisse erhalten'}`, async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-upgrade-'));
    const oldState = {
      players: names.slice(0, 4).map((name, i) => ({ id: `p${i + 1}`, name })),
      results: { '0-0': 'p1' }, createdAt: '2026-10-19T00:00:00.000Z',
      ...(existingCode ? { code: existingCode } : {}),
    };
    const db = new DatabaseSync(join(dataDir, 'tournament.sqlite'));
    db.exec('CREATE TABLE tournament (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT, version INTEGER NOT NULL DEFAULT 0)');
    db.prepare('INSERT INTO tournament VALUES (1, ?, 7)').run(JSON.stringify(oldState));
    db.close();
    let app = createApp({ dataDir });
    try {
      const cookie = await login(app);
      const current = (await request(app, '/api/tournament', { cookie })).body;
      const code = current.tournament.code;
      assert.match(code, /^\d{6}$/);
      if (existingCode) assert.equal(code, existingCode);
      assert.deepEqual(current.tournament.players, oldState.players);
      assert.deepEqual(current.tournament.results, oldState.results);
      assert.equal(current.tournament.createdAt, oldState.createdAt);
      assert.equal(current.version, existingCode ? 7 : 8);
      assert.equal((await request(app, `/api/tree/${code}`)).status, 200);
      app.emit('close');
      app = createApp({ dataDir });
      assert.equal((await request(app, `/api/tree/${code}`)).body.tournament.code, code);
      assert.equal((await request(app, '/api/tournament', { cookie })).body.version, current.version);
    } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
  });
}
