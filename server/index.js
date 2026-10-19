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
const resetLifetime = 60 * 60 * 1000;
const resetCooldown = 60 * 1000;
const appName = 'Ts-Tree';

function hashPassword(password, salt = randomBytes(16)) {
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(':');
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(expected, 'hex'));
}
// Checked against when the address is unknown, so a login takes as long either way.
const dummyPassword = hashPassword(randomBytes(16).toString('hex'));
function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationError('Bitte gib eine gültige E-Mail-Adresse ein.');
  return email;
}
function validPassword(value) {
  if (typeof value !== 'string' || value.length < 8) throw new ValidationError('Das Passwort muss mindestens 8 Zeichen lang sein.');
  if (value.length > 256) throw new ValidationError('Das Passwort darf höchstens 256 Zeichen lang sein.');
  return value;
}
const escapeHtml = value => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

// Sends through Resend. Without RESEND_API_KEY the link is logged instead, so the flow works locally.
export function resendMailer({ apiKey = process.env.RESEND_API_KEY, from = process.env.MAIL_FROM || 'noreply@tuerker-cakici.de' } = {}) {
  return async ({ to, subject, text, html }) => {
    if (!apiKey) { console.warn(`RESEND_API_KEY nicht gesetzt – Mail an ${to}:\n${text}`); return; }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: `${appName} <${from}>`, to: [to], subject, text, html }),
      });
      if (!response.ok) console.error(`Resend hat die Mail abgelehnt (${response.status}): ${await response.text()}`);
    } catch (error) { console.error('Resend nicht erreichbar:', error); }
  };
}

export function createApp({ dataDir = process.env.DATA_DIR || resolve(root, 'data'),
  cookieSecure = process.env.COOKIE_SECURE === 'true', cookiePath = process.env.COOKIE_PATH || '/',
  appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  sendMail = resendMailer(), distDir = resolve(root, 'dist') } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'tournament.sqlite'));
  // The old single-admin tables (`tournament`, `sessions`) are left alone; their codes stay reserved in issued_codes.
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS tournaments (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, state TEXT, code TEXT UNIQUE, version INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS password_resets (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created INTEGER NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS issued_codes (code TEXT PRIMARY KEY);`);
  db.prepare('DELETE FROM user_sessions WHERE expires < ?').run(Date.now());
  const attempts = new Map();
  // At most `limit` counted attempts per IP and action within 15 minutes.
  function limited(req, action, limit) {
    const now = Date.now();
    for (const [key, attempt] of attempts) if (attempt.until < now) attempts.delete(key);
    const key = `${action}:${req.socket.remoteAddress}`;
    const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    attempts.set(key, attempt);
    return { blocked: attempt.count >= limit, count: () => attempt.count++, clear: () => attempts.delete(key) };
  }
  const getState = userId => {
    const row = db.prepare('SELECT state, version FROM tournaments WHERE user_id=?').get(userId);
    return { tournament: row?.state ? JSON.parse(row.state) : null, version: row?.version || 0 };
  };
  function writeState(userId, state, version) {
    const result = db.prepare('UPDATE tournaments SET state=?, code=?, version=version+1 WHERE user_id=? AND version=?')
      .run(state ? JSON.stringify(state) : null, state?.code || null, userId, version);
    if (!result.changes) throw Object.assign(new Error('Das Turnier wurde zwischenzeitlich geändert. Der aktuelle Stand wurde geladen.'), { status: 409 });
    return getState(userId);
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
  function cookie(token, age = sessionLifetime / 1000) {
    return `padel_session=${token}; HttpOnly; SameSite=Strict; Path=${cookiePath}; Max-Age=${age}${cookieSecure ? '; Secure' : ''}`;
  }
  function startSession(res, userId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO user_sessions VALUES (?, ?, ?)').run(hash(token), userId, Date.now() + sessionLifetime);
    res.setHeader('Set-Cookie', cookie(token));
  }
  function sendResetMail(email, token) {
    const link = `${appUrl}/reset-password?token=${token}`;
    const text = `Hallo,\n\njemand hat ein neues Passwort für dein ${appName}-Konto angefordert. Über diesen Link kannst du eines festlegen:\n\n${link}\n\nDer Link funktioniert einmal und ist eine Stunde gültig. Warst du das nicht, ignoriere diese Mail – dein Passwort bleibt unverändert.`;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#20352e;line-height:1.6">
  <p>Hallo,</p><p>jemand hat ein neues Passwort für dein ${appName}-Konto angefordert.</p>
  <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#183e2f;color:#fff;text-decoration:none;font-weight:600">Neues Passwort festlegen</a></p>
  <p style="color:#778079;font-size:13px">Der Link funktioniert einmal und ist eine Stunde gültig.<br>Warst du das nicht, ignoriere diese Mail – dein Passwort bleibt unverändert.</p></div>`;
    // Not awaited: the response must not reveal, by its timing, whether the address exists.
    Promise.resolve(sendMail({ to: email, subject: `${appName}: Passwort zurücksetzen`, text, html })).catch(error => console.error(error));
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
        const row = /^\d{6}$/.test(code) && db.prepare('SELECT state FROM tournaments WHERE code=?').get(code);
        if (!row?.state) {
          return send(404, { error: 'Dieses Turnier ist nicht verfügbar. Prüfe den Code; möglicherweise wurde das Turnier gelöscht.' });
        }
        const { players, results, createdAt } = JSON.parse(row.state);
        return send(200, { tournament: { code, players, results, createdAt } });
      }
      if (path === '/api/register' && req.method === 'POST') {
        const limit = limited(req, 'register', 10);
        if (limit.blocked) return send(429, { error: 'Zu viele Registrierungen. Bitte in 15 Minuten erneut versuchen.' });
        const data = await body(req);
        const email = normalizeEmail(data.email);
        const password = validPassword(data.password);
        limit.count();
        const userId = withTransaction(() => {
          if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) {
            throw Object.assign(new Error('Für diese E-Mail-Adresse gibt es bereits ein Konto. Melde dich an oder setze dein Passwort zurück.'), { status: 409 });
          }
          const id = Number(db.prepare('INSERT INTO users (email, password, created) VALUES (?, ?, ?)').run(email, hashPassword(password), Date.now()).lastInsertRowid);
          db.prepare('INSERT INTO tournaments (user_id) VALUES (?)').run(id);
          return id;
        });
        startSession(res, userId);
        return send(201, { email });
      }
      if (path === '/api/login' && req.method === 'POST') {
        const limit = limited(req, 'login', 10);
        if (limit.blocked) return send(429, { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' });
        const data = await body(req);
        const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
        const candidate = typeof data.password === 'string' && data.password.length <= 256 ? data.password : '';
        const user = db.prepare('SELECT id, password FROM users WHERE email=?').get(email);
        const valid = verifyPassword(candidate, user?.password || dummyPassword) && user;
        if (!valid) {
          limit.count();
          return send(401, { error: 'E-Mail-Adresse oder Passwort ist falsch.' });
        }
        limit.clear();
        db.prepare('DELETE FROM user_sessions WHERE expires < ?').run(Date.now());
        startSession(res, user.id);
        return send(200, { email });
      }
      if (path === '/api/forgot-password' && req.method === 'POST') {
        const limit = limited(req, 'forgot', 5);
        if (limit.blocked) return send(429, { error: 'Zu viele Anfragen. Bitte in 15 Minuten erneut versuchen.' });
        const data = await body(req);
        const email = normalizeEmail(data.email);
        limit.count();
        const now = Date.now();
        const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
        const recent = user && db.prepare('SELECT 1 FROM password_resets WHERE user_id=? AND created > ?').get(user.id, now - resetCooldown);
        if (user && !recent) {
          const token = randomBytes(32).toString('hex');
          db.prepare('DELETE FROM password_resets WHERE expires < ? OR used = 1').run(now);
          // Only the hash is stored, so a database copy holds no working reset links.
          db.prepare('INSERT INTO password_resets (token, user_id, created, expires) VALUES (?, ?, ?, ?)').run(hash(token), user.id, now, now + resetLifetime);
          sendResetMail(email, token);
        }
        // Same answer whether or not the address is registered.
        return send(200, { ok: true });
      }
      if (path === '/api/reset-password' && req.method === 'POST') {
        const limit = limited(req, 'reset', 10);
        if (limit.blocked) return send(429, { error: 'Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.' });
        const data = await body(req);
        const password = validPassword(data.password);
        const token = typeof data.token === 'string' ? data.token : '';
        const user = withTransaction(() => {
          // Claimed inside the UPDATE, so a link works exactly once even under concurrent requests.
          const claimed = db.prepare('UPDATE password_resets SET used=1 WHERE token=? AND used=0 AND expires > ? RETURNING user_id').get(hash(token), Date.now());
          if (!claimed) return null;
          db.prepare('UPDATE users SET password=? WHERE id=?').run(hashPassword(password), claimed.user_id);
          // Whoever else knew the old password is signed out everywhere.
          db.prepare('DELETE FROM user_sessions WHERE user_id=?').run(claimed.user_id);
          db.prepare('DELETE FROM password_resets WHERE user_id=?').run(claimed.user_id);
          return db.prepare('SELECT id, email FROM users WHERE id=?').get(claimed.user_id);
        });
        if (!user) {
          limit.count();
          return send(400, { error: 'Dieser Link ist ungültig oder abgelaufen. Fordere einen neuen an.' });
        }
        startSession(res, user.id);
        return send(200, { email: user.email });
      }
      if (path.startsWith('/api/')) {
        const token = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith('padel_session='))?.slice(14) || '';
        const session = db.prepare('SELECT users.id, users.email FROM user_sessions JOIN users ON users.id = user_sessions.user_id WHERE token=? AND expires > ?').get(hash(token), Date.now());
        if (!session) return send(401, { error: 'Bitte melde dich an.' });
        const userId = session.id;
        if (path === '/api/session' && req.method === 'GET') return send(200, { email: session.email });
        if (path === '/api/logout' && req.method === 'POST') {
          await body(req);
          db.prepare('DELETE FROM user_sessions WHERE token=?').run(hash(token));
          res.setHeader('Set-Cookie', cookie('', 0));
          return send(200, { ok: true });
        }
        if (path === '/api/tournament' && req.method === 'GET') return send(200, getState(userId));
        if ((path === '/api/tournament' && ['POST', 'DELETE'].includes(req.method)) ||
          (path === '/api/tournament/winner' && req.method === 'POST')) {
          const data = await body(req);
          const current = getState(userId);
          if (!Number.isInteger(data.version) || data.version !== current.version) return send(409, { error: 'Das Turnier wurde zwischenzeitlich geändert. Der aktuelle Stand wurde geladen.' });
          if (req.method === 'DELETE') return send(200, writeState(userId, null, data.version));
          if (path.endsWith('/winner')) {
            if (!current.tournament) throw new ValidationError('Bitte lege zuerst ein Turnier an.');
            return send(200, writeState(userId, selectWinner(current.tournament, data.matchId, data.playerId), data.version));
          }
          if (current.tournament) return send(409, { error: 'Es gibt bereits ein Turnier. Wähle zuerst „Neues Spiel“.' });
          const next = createTournament(data.names);
          return send(201, withTransaction(() => writeState(userId, { ...next, code: reserveCode() }, data.version)));
        }
        return send(404, { error: 'Nicht gefunden.' });
      }
      if (!['GET', 'HEAD'].includes(req.method)) return send(405, { error: 'Methode nicht erlaubt.' });
      // Serve only the compiled public assets, never source files or the database.
      const isPage = path === '/' || path === '/reset-password' || path === '/tree' || path.startsWith('/tree/');
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
