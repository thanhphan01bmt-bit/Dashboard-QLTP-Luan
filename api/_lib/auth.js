// Đăng nhập, phiên (cookie ký HMAC) và danh sách tài khoản.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { readJSON, writeJSON } from './store.js';

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'kv_sid';
const SESSION_DAYS = 30;
export const USERS_FILE = 'auth/users.json';
export const ROLES = { admin: 'Quản trị', editor: 'Cập nhật dữ liệu', viewer: 'Chỉ xem' };

export function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
export const fail = (msg, status = 400) => json({ error: msg }, status);

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('Thiếu biến môi trường SESSION_SECRET (ít nhất 16 ký tự).');
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => b64(crypto.createHmac('sha256', secret()).update(data).digest());

export function normUser(u) { return String(u || '').trim().toLowerCase(); }
export const validUser = (u) => /^[a-z0-9._-]{3,32}$/.test(u);

export async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(String(pw), salt, 32);
  return `s1$${b64(salt)}$${b64(key)}`;
}
export async function checkPassword(pw, stored) {
  if (!stored || !stored.startsWith('s1$')) return false;
  const [, s, k] = stored.split('$');
  const key = await scrypt(String(pw), Buffer.from(s, 'base64url'), 32);
  const want = Buffer.from(k, 'base64url');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Giữ danh sách tài khoản trong bộ nhớ 20 giây để giảm số lượt đọc Blob (gói Hobby có hạn mức).
let USERS_MEM = null, USERS_AT = 0;
export async function loadUsers(fresh = false) {
  if (!fresh && USERS_MEM && Date.now() - USERS_AT < 20000) return structuredClone(USERS_MEM);
  const db = (await readJSON(USERS_FILE)) || { users: [] };
  USERS_MEM = db; USERS_AT = Date.now();
  return structuredClone(db);
}
export async function saveUsers(db) { await writeJSON(USERS_FILE, db); USERS_MEM = structuredClone(db); USERS_AT = Date.now(); }

// Chỉ kiểm tra chữ ký cookie (không đọc Blob) — dùng cho việc hỏi giờ cập nhật số liệu.
export function sessionOk(req) {
  const tok = readCookie(req);
  if (!tok) return false;
  const [payload, sig] = tok.split('.');
  if (!payload || !sig || !safeEq(sig, sign(payload))) return false;
  try { const p = JSON.parse(Buffer.from(payload, 'base64url').toString()); return !!p.exp && p.exp > Date.now(); } catch { return false; }
}

export function envAdmin() {
  const u = normUser(process.env.ADMIN_USER);
  return u && process.env.ADMIN_PASSWORD ? { u, name: process.env.ADMIN_NAME || 'Quản trị', role: 'admin', env: true } : null;
}

// Kiểm tra user + mật khẩu. Trả về {u,name,role} hoặc null.
export async function verifyLogin(user, pw) {
  const u = normUser(user);
  const ea = envAdmin();
  if (ea && u === ea.u) return safeEq(pw, process.env.ADMIN_PASSWORD) ? ea : null;
  const db = await loadUsers();
  const rec = db.users.find((x) => x.u === u);
  if (!rec || rec.disabled) { await checkPassword(pw, 's1$AAAAAAAAAAAAAAAAAAAAAA$AAAA'); return null; }
  return (await checkPassword(pw, rec.hash)) ? { u: rec.u, name: rec.name || rec.u, role: rec.role, pwVer: rec.pwVer || 0 } : null;
}

export function sessionCookie(u, pwVer = 0) {
  const payload = b64(JSON.stringify({ u, v: pwVer, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const tok = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function readCookie(req) {
  const h = req.headers.get('cookie') || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : null;
}

// Lấy người dùng của phiên hiện tại (đọc lại quyền mới nhất từ danh sách tài khoản).
export async function currentUser(req) {
  const tok = readCookie(req);
  if (!tok) return null;
  const [payload, sig] = tok.split('.');
  if (!payload || !sig || !safeEq(sig, sign(payload))) return null;
  let p; try { p = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!p.exp || p.exp < Date.now()) return null;
  const ea = envAdmin();
  if (ea && p.u === ea.u) return ea;
  const db = await loadUsers();
  const rec = db.users.find((x) => x.u === p.u);
  if (!rec || rec.disabled || (rec.pwVer || 0) !== (p.v || 0)) return null;
  return { u: rec.u, name: rec.name || rec.u, role: rec.role };
}

// Chặn gửi form từ trang khác: mọi request ghi phải là JSON và có header X-Req.
export function sameOriginWrite(req) {
  return req.headers.get('x-req') === '1' && /application\/json/.test(req.headers.get('content-type') || '');
}

export async function readBody(req, maxBytes = 8 * 1024 * 1024) {
  const len = +(req.headers.get('content-length') || 0);
  if (len > maxBytes) throw Object.assign(new Error('Dữ liệu quá lớn.'), { status: 413 });
  const txt = await req.text();
  if (txt.length > maxBytes) throw Object.assign(new Error('Dữ liệu quá lớn.'), { status: 413 });
  try { return JSON.parse(txt || '{}'); } catch { throw Object.assign(new Error('Dữ liệu gửi lên không hợp lệ.'), { status: 400 }); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
