import { createServer } from 'node:http';
import { randomBytes, randomInt, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTournament, selectWinner, ValidationError } from '../shared/tournament.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => createHash('sha256').update(value).digest('hex');
const sessionLifetime = 12 * 60 * 60 * 1000;

export function createApp({ dataDir = process.env.DATA_DIR || resolve(root, 'data'),
  username = process.env.ADMIN_USERNAME || 'admin', password = process.env.ADMIN_PASSWORD || 'PadelTurnier',
  cookieSecure = process.env.COOKIE_SECURE === 'true', cookiePath = process.env.COOKIE_PATH || '/', distDir = resolve(root, 'dist') } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'tournament.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS tournament (id INTEGER PRIMARY KEY CHECK(id=1), state TEXT, version INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO tournament (id, state) VALUES (1, NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL, identity TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS issued_codes (code TEXT PRIMARY KEY);`);
  const salt = randomBytes(16);
  const passwordHash = scryptSync(password, salt, 64);
  const identity = hash(`${username}\0${password}`);
  db.prepare('DELETE FROM sessions WHERE identity != ? OR expires < ?').run(identity, Date.now());
  const attempts = new Map();
  const getState = () => {
    const row = db.prepare('SELECT state, version FROM tournament WHERE id=1').get();
    return { tournament: row.state ? JSON.parse(row.state) : null, version: row.version };
  };
  function writeState(state, version) {
    const result = db.prepare('UPDATE tournament SET state=?, version=version+1 WHERE id=1 AND version=?')
      .run(state ? JSON.stringify(state) : null, version);
    if (!result.changes) throw Object.assign(new Error('Das Turnier wurde zwischenzeitlich geändert. Der aktuelle Stand wurde geladen.'), { status: 409 });
    return getState();
  }
  function reserveCode() {
    if (db.prepare('SELECT COUNT(*) AS count FROM issued_codes').get().count >= 1000000) {
      throw Object.assign(new Error('Alle sechsstelligen Turniercodes wurden bereits vergeben.'), { status: 409 });
    }
    const insert = db.prepare('INSERT OR IGNORE INTO issued_codes (code) VALUES (?)');
    // Preserve leading zeroes; the unique constraint prevents collisions and reuse.
    while (true) {
      const code = String(randomInt(1000000)).padStart(6, '0');
      if (insert.run(code).changes) return code;
    }
  }
  function withTransaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = action();
      db.exec('COMMIT');
      return result;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  // Give an existing tournament a code when upgrading, without resetting results.
  withTransaction(() => {
    const current = getState();
    if (!current.tournament) return;
    if (/^\d{6}$/.test(current.tournament.code || '')) {
      db.prepare('INSERT OR IGNORE INTO issued_codes (code) VALUES (?)').run(current.tournament.code);
    } else {
      writeState({ ...current.tournament, code: reserveCode() }, current.version);
    }
  });
  function cookie(token, age = sessionLifetime / 1000) {
    return `padel_session=${token}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${age}${cookieSecure ? '; Secure' : ''}`;
  }
  async function body(req) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('JSON erwartet.'), { status: 415 });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 16384) throw Object.assign(new Error('Anfrage zu groß.'), { status: 413 });
      chunks.push(chunk);
    }
    try {
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
      return data;
    } catch { throw new ValidationError('Ungültige Anfrage.'); }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    const send = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(payload));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const mutating = !['GET', 'HEAD'].includes(req.method);
      if (mutating && (req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) return send(403, { error: 'Anfrage von einer fremden Seite abgelehnt.' });
      if (path === '/api/health' && req.method === 'GET') return send(200, { ok: true });
      if (path.startsWith('/api/tree/')) {
        if (req.method !== 'GET') return send(405, { error: 'Diese Ansicht ist nur zum Lesen verfügbar.' });
        const code = path.slice('/api/tree/'.length);
        const { tournament } = getState();
        if (!/^\d{6}$/.test(code) || !tournament || tournament.code !== code) {
          return send(404, { error: 'Dieses Turnier ist nicht verfügbar. Prüfe den Code; möglicherweise wurde das Turnier gelöscht.' });
        }
        const { players, results, createdAt } = tournament;
        return send(200, { tournament: { code, players, results, createdAt } });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const now = Date.now();
        for (const [key, attempt] of attempts) if (attempt.until < now) attempts.delete(key);
        const ip = req.socket.remoteAddress;
        const attempt = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
        if (attempt.count >= 10) return send(429, { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
        const data = await body(req);
        const candidate = typeof data.password === 'string' && data.password.length <= 256 ? data.password : '';
        const valid = timingSafeEqual(scryptSync(candidate, salt, 64), passwordHash);
        if (!valid || data.username !== username) {
          attempt.count++;
          attempts.set(ip, attempt);
          return send(401, { error: 'Anmeldename oder Passwort ist falsch.' });
        }
        attempts.delete(ip);
        const token = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
        db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(token), now + sessionLifetime, identity);
        res.setHeader('Set-Cookie', cookie(token));
        return send(200, { username });
      }
      if (path.startsWith('/api/')) {
        const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('padel_session='))?.slice(14) || '';
        const session = db.prepare('SELECT expires FROM sessions WHERE token=? AND identity=?').get(hash(token), identity);
        if (!session || session.expires < Date.now()) return send(401, { error: 'Bitte melde dich an.' });
        if (path === '/api/session' && req.method === 'GET') return send(200, { username });
        if (path === '/api/logout' && req.method === 'POST') {
          await body(req);
          db.prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
          res.setHeader('Set-Cookie', cookie('', 0));
          return send(200, { ok: true });
        }
        if (path === '/api/tournament' && req.method === 'GET') return send(200, getState());
        if ((path === '/api/tournament' && ['POST', 'DELETE'].includes(req.method)) ||
          (path === '/api/tournament/winner' && req.method === 'POST')) {
          const data = await body(req);
          const current = getState();
          if (!Number.isInteger(data.version) || data.version !== current.version) return send(409, { error: 'Das Turnier wurde zwischenzeitlich geändert. Der aktuelle Stand wurde geladen.' });
          if (req.method === 'DELETE') return send(200, writeState(null, data.version));
          if (path.endsWith('/winner')) {
            if (!current.tournament) throw new ValidationError('Bitte lege zuerst ein Turnier an.');
            return send(200, writeState(selectWinner(current.tournament, data.matchId, data.playerId), data.version));
          }
          if (current.tournament) return send(409, { error: 'Es gibt bereits ein Turnier. Wähle zuerst „Neues Spiel“.' });
          const next = createTournament(data.names);
          return send(201, withTransaction(() => writeState({ ...next, code: reserveCode() }, data.version)));
        }
        return send(404, { error: 'Nicht gefunden.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Methode nicht erlaubt.' });
      // Serve only the compiled public assets, never source files or the database.
      const isPage = path === '/' || path === '/tree' || path.startsWith('/tree/');
      const file = isPage ? resolve(distDir, 'index.html') : resolve(distDir, `.${decodeURIComponent(path)}`);
      if (!file.startsWith(`${resolve(distDir)}/`)) return send(404, { error: 'Nicht gefunden.' });
      let content;
      try { content = readFileSync(file); } catch { return send(404, { error: 'Nicht gefunden.' }); }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
      res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      const status = error instanceof ValidationError ? 400 : error.status || 500;
      if (status === 500) console.error(error);
      send(status, { error: status === 500 ? 'Ein Serverfehler ist aufgetreten.' : error.message });
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, process.env.BIND_ADDR || '0.0.0.0', () => console.log(`Ts-Tree läuft auf http://localhost:${port}`));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
}
