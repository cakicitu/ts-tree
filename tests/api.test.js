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
const create = (app, cookie, data = { names }, headers) => request(app, '/api/tournaments', { method: 'POST', cookie, data, headers });
const list = async (app, cookie) => (await request(app, '/api/tournaments', { cookie })).body.tournaments;

test('Login erforderlich, falsches Passwort, E-Mail ohne Groß-/Kleinschreibung, sichere Sitzung und Abmelden', async t => {
  const { app } = fixture(t, { cookieSecure: true });
  for (const [url, method] of [['/api/tournaments', 'GET'], ['/api/tournaments', 'POST'], ['/api/tournaments/1', 'DELETE'], ['/api/tournaments/1/winner', 'POST'], ['/api/tournaments/1/score', 'POST']]) {
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

test('Mehrere Turniere: anlegen ohne Löschen, neuestes zuerst, Sieger speichern, Konflikte, einzeln löschen', async t => {
  const { app } = fixture(t);
  const cookie = await register(app);
  assert.deepEqual(await list(app, cookie), []);
  const first = await create(app, cookie, { names, title: '  Vereinsmeisterschaft ' });
  assert.equal(first.status, 201);
  assert.equal(first.body.version, 0);
  assert.equal(first.body.tournament.title, 'Vereinsmeisterschaft');
  assert.equal(first.body.tournament.players.length, 10);
  const second = await create(app, cookie, { names: names.slice(0, 4) });
  assert.equal(second.status, 201);
  assert.equal(second.body.tournament.title, undefined);
  assert.notEqual(second.body.tournament.code, first.body.tournament.code);
  assert.deepEqual((await list(app, cookie)).map(item => item.id), [second.body.id, first.body.id]);
  const winner = (id, data) => request(app, `/api/tournaments/${id}/winner`, { method: 'POST', cookie, data });
  const won = await winner(first.body.id, { matchId: '0-1', playerId: 'p8', version: 0 });
  assert.equal(won.status, 200);
  assert.equal(won.body.version, 1);
  assert.equal(won.body.tournament.results['0-1'], 'p8');
  assert.equal((await winner(first.body.id, { matchId: '0-1', playerId: 'p9', version: 0 })).status, 409);
  assert.deepEqual((await list(app, cookie)).find(item => item.id === second.body.id).tournament.results, {});
  assert.equal((await request(app, `/api/tournaments/${second.body.id}`, { method: 'DELETE', cookie, data: {} })).status, 200);
  assert.deepEqual((await list(app, cookie)).map(item => item.id), [first.body.id]);
  assert.equal((await request(app, `/api/tournaments/${second.body.id}`, { method: 'DELETE', cookie, data: {} })).status, 404);
  assert.equal((await winner(second.body.id, { matchId: '0-0', playerId: 'p1', version: 0 })).status, 404);
  assert.equal((await create(app, cookie, { names, title: 'x'.repeat(61) })).status, 400);
});

test('SQLite erhält Konto, Turniere und Sitzung nach Neustart', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-restart-'));
  let app = createApp({ dataDir, sendMail: quiet });
  try {
    const cookie = await register(app);
    const created = await create(app, cookie);
    await create(app, cookie, { names: names.slice(0, 5), format: 'league' });
    await request(app, `/api/tournaments/${created.body.id}/winner`, { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 0 } });
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    const stored = await list(app, cookie);
    assert.equal(stored.length, 2);
    assert.equal(stored[1].tournament.results['0-1'], 'p8');
    assert.equal(stored[0].tournament.format, 'league');
    assert.equal((await list(app, await login(app))).length, 2);
  } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
});

test('Eingabevalidierung, JSON-Limit und Schutz gegen fremde Origins', async t => {
  const { app } = fixture(t);
  const cookie = await register(app);
  const mutate = data => create(app, cookie, data);
  assert.equal((await mutate({ names: ['nur einer'] })).status, 400);
  assert.equal((await mutate({ names: names.slice(0, 3) })).status, 400);
  assert.equal((await mutate({ names: [...names.slice(0, 7), ' '] })).status, 400);
  assert.equal((await mutate({ names, title: 7 })).status, 400);
  assert.equal((await request(app, '/api/tournaments', { method: 'POST', cookie, raw: '{kaputt' })).status, 400);
  assert.equal((await request(app, '/api/tournaments', { method: 'POST', cookie, raw: 'x'.repeat(17000) })).status, 413);
  assert.equal((await create(app, cookie, { names }, { origin: 'https://example.com' })).status, 403);
  assert.equal((await create(app, cookie, { names }, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await request(app, '/api/tournaments/abc', { method: 'DELETE', cookie, data: {} })).status, 404);
  assert.equal((await mutate({ names })).status, 201);
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
  const created = await create(app, cookie, { names, title: 'Sommercup' });
  const { id, tournament } = created.body;
  const code = tournament.code;
  assert.match(code, /^\d{6}$/);
  const shared = await request(app, `/api/tree/${code}`);
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.body.tournament, tournament);
  assert.equal(shared.body.tournament.title, 'Sommercup');
  assert.equal(shared.body.version, undefined);
  assert.equal(shared.headers['set-cookie'], undefined);
  assert.equal(shared.headers['cache-control'], 'no-store');
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await request(app, `/api/tree/${code}`, { method, data: { playerId: 'p8' } })).status, 405);
  }
  for (const [url, method] of [['/api/tournaments', 'POST'], [`/api/tournaments/${id}`, 'DELETE'], [`/api/tournaments/${id}/winner`, 'POST']]) {
    assert.equal((await request(app, url, { method, data: { names, version: 0, matchId: '0-1', playerId: 'p8' } })).status, 401);
  }
  for (const invalid of ['12345', '1234567', 'abcdef', `${code}/winner`]) {
    assert.equal((await request(app, `/api/tree/${invalid}`)).status, 404);
  }
  await request(app, `/api/tournaments/${id}/winner`, { method: 'POST', cookie, data: { matchId: '0-1', playerId: 'p8', version: 0 } });
  const updated = await request(app, `/api/tree/${code}`);
  assert.equal(updated.body.tournament.results['0-1'], 'p8');
  assert.equal(updated.body.tournament.code, code);
});

test('Gelöschte Codes bleiben über Neustarts reserviert und zeigen kein neues Turnier', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-codes-'));
  let app = createApp({ dataDir, sendMail: quiet });
  try {
    let cookie = await register(app);
    const first = await create(app, cookie);
    const firstCode = first.body.tournament.code;
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).body.tournament.code, firstCode);
    cookie = await login(app);
    await request(app, `/api/tournaments/${first.body.id}`, { method: 'DELETE', cookie, data: {} });
    assert.equal((await request(app, `/api/tree/${firstCode}`)).status, 404);
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    const second = await create(app, cookie);
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

test('Konten sehen und ändern nur ihre eigenen Turniere', async t => {
  const { app } = fixture(t);
  const anna = await register(app, 'anna@example.com');
  const ben = await register(app, 'ben@example.com');
  const annas = await create(app, anna);
  assert.deepEqual(await list(app, ben), []);
  const bens = await create(app, ben, { names: names.slice(0, 4) });
  assert.notEqual(bens.body.tournament.code, annas.body.tournament.code);
  assert.equal((await request(app, `/api/tournaments/${annas.body.id}/winner`, { method: 'POST', cookie: ben, data: { matchId: '0-1', playerId: 'p8', version: 0 } })).status, 404);
  assert.equal((await request(app, `/api/tournaments/${annas.body.id}`, { method: 'DELETE', cookie: ben, data: {} })).status, 404);
  assert.equal((await list(app, anna)).length, 1);
  assert.equal((await request(app, `/api/tree/${annas.body.tournament.code}`)).body.tournament.players.length, 10);
  assert.equal((await request(app, `/api/tree/${bens.body.tournament.code}`)).body.tournament.players.length, 4);
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

test('Fehlermeldungen und Reset-Mail folgen der gewählten Sprache', async t => {
  const mails = [];
  const { app } = fixture(t, { sendMail: mail => mails.push(mail) });
  const de = await request(app, '/api/login', { method: 'POST', data: { email: 'x@example.com', password: 'falsch' } });
  assert.equal(de.body.error, 'E-Mail-Adresse oder Passwort ist falsch.');
  const en = await request(app, '/api/login', { method: 'POST', data: { email: 'x@example.com', password: 'falsch' }, headers: { 'x-lang': 'en' } });
  assert.equal(en.body.error, 'Email address or password is incorrect.');
  const cookie = await register(app);
  const invalid = await create(app, cookie, { names: ['a'] }, { 'x-lang': 'en' });
  assert.equal(invalid.body.error, 'Please choose 4 to 16 players.');
  await request(app, '/api/forgot-password', { method: 'POST', data: { email: 'anna@example.com' }, headers: { 'x-lang': 'en' } });
  assert.equal(mails[0].subject, 'Ts-Tree: Reset your password');
  assert.match(mails[0].html, /Choose a new password/);
});

test('Jeder gegen jeden: anlegen, Ergebnisse speichern und löschen, öffentlich lesen', async t => {
  const { app } = fixture(t);
  const cookie = await register(app);
  const created = await create(app, cookie, { names: ['A', 'B', 'C'], format: 'league' });
  assert.equal(created.status, 201);
  assert.equal(created.body.tournament.format, 'league');
  const base = `/api/tournaments/${created.body.id}`;
  const post = (path, data) => request(app, path, { method: 'POST', cookie, data });
  assert.equal((await post(`${base}/winner`, { matchId: 'p1-p2', playerId: 'p1', version: 0 })).status, 400);
  assert.equal((await post(`${base}/score`, { matchId: 'p1-p2', score: [-1, 2], version: 0 })).status, 400);
  const scored = await post(`${base}/score`, { matchId: 'p1-p2', score: [4, 2], version: 0 });
  assert.equal(scored.status, 200);
  assert.deepEqual(scored.body.tournament.results, { 'p1-p2': [4, 2] });
  assert.equal((await post(`${base}/score`, { matchId: 'p1-p3', score: [1, 0], version: 0 })).status, 409);
  const shared = await request(app, `/api/tree/${created.body.tournament.code}`);
  assert.equal(shared.body.tournament.format, 'league');
  assert.deepEqual(shared.body.tournament.results, { 'p1-p2': [4, 2] });
  const cleared = await post(`${base}/score`, { matchId: 'p1-p2', score: null, version: 1 });
  assert.deepEqual(cleared.body.tournament.results, {});
  assert.equal((await create(app, cookie, { names: ['A', 'B'], format: 'league' })).status, 400);
  const ko = await create(app, cookie, { names: ['A', 'B', 'C', 'D'] });
  assert.equal(ko.status, 201);
  assert.equal((await post(`/api/tournaments/${ko.body.id}/score`, { matchId: 'p1-p2', score: [1, 0], version: 0 })).status, 400);
});

test('Bestehendes Einzelturnier wird beim Start in die Turnierliste übernommen', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ts-tree-migrate-'));
  let app = createApp({ dataDir, sendMail: quiet });
  try {
    const cookie = await register(app);
    app.emit('close');
    const state = { format: 'ko', players: names.slice(0, 4).map((name, i) => ({ id: `p${i + 1}`, name })), results: { '0-0': 'p1' }, createdAt: '2026-10-19T10:00:00.000Z', code: '004711' };
    const db = new DatabaseSync(join(dataDir, 'tournament.sqlite'));
    db.exec('CREATE TABLE tournaments (user_id INTEGER PRIMARY KEY, state TEXT, code TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 0)');
    db.prepare('INSERT INTO tournaments VALUES (1, ?, ?, 3)').run(JSON.stringify(state), '004711');
    db.prepare("INSERT INTO issued_codes VALUES ('004711')").run();
    db.close();
    app = createApp({ dataDir, sendMail: quiet });
    const [migrated] = await list(app, cookie);
    assert.deepEqual(migrated.tournament, state);
    assert.equal(migrated.version, 3);
    assert.equal((await request(app, '/api/tree/004711')).status, 200);
    app.emit('close');
    app = createApp({ dataDir, sendMail: quiet });
    assert.equal((await list(app, cookie)).length, 1);
  } finally { app.emit('close'); rmSync(dataDir, { recursive: true, force: true }); }
});

