// Gửi Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) chỉ dùng node:crypto, không cần thư viện ngoài.
import crypto from 'node:crypto';
import { readJSON, writeJSON } from './store.js';

const b64u = (b) => Buffer.from(b).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');
export const SUBS_FILE = 'push/subs.json';
const VAPID_FILE = 'push/vapid.json';

// Khóa VAPID tự tạo lần đầu và lưu trong kho Blob riêng tư.
let VAPID = null;
export async function getVapid() {
  if (VAPID) return VAPID;
  let v = await readJSON(VAPID_FILE);
  if (!v) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = privateKey.export({ format: 'jwk' });
    const pub = Buffer.concat([Buffer.from([4]), fromB64u(jwk.x), fromB64u(jwk.y)]);
    v = { publicKey: b64u(pub), jwk };
    await writeJSON(VAPID_FILE, v);
  }
  VAPID = v;
  return v;
}

function vapidJwt(endpoint, jwk, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const key = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64u(sig)}`;
}

// Mã hóa nội dung theo RFC 8291. Tham số asPriv/salt chỉ dùng khi kiểm thử.
export function encrypt(payload, p256dh, auth, { asPriv, salt } = {}) {
  const uaPublic = fromB64u(p256dh), authSecret = fromB64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  if (asPriv) ecdh.setPrivateKey(fromB64u(asPriv)); else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const s = salt ? fromB64u(salt) : crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, s, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, s, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([s, rs, Buffer.from([asPublic.length]), asPublic, ct]);
}

export async function sendOne(sub, payload, subject) {
  const v = await getVapid();
  const body = encrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
      Authorization: `vapid t=${vapidJwt(sub.endpoint, v.jwk, subject)}, k=${v.publicKey}`,
    },
    body,
  });
  return r.status;
}

// Gửi cho tất cả (hoặc lọc theo hàm keep). Tự xóa đăng ký đã hết hạn (404/410).
export async function sendAll(payload, subject, keep = () => true) {
  const db = (await readJSON(SUBS_FILE)) || { subs: {} };
  const list = Object.entries(db.subs).filter(([, s]) => keep(s));
  let ok = 0, gone = 0, fail = 0;
  await Promise.all(list.map(async ([ep, s]) => {
    try {
      const st = await sendOne(s, payload, subject);
      if (st >= 200 && st < 300) ok++;
      else if (st === 404 || st === 410) { delete db.subs[ep]; gone++; }
      else { fail++; console.error('push status', st); }
    } catch (e) { fail++; console.error('push error', e.message); }
  }));
  if (gone) { try { await writeJSON(SUBS_FILE, db); } catch (e) { console.error(e); } }
  return { ok, gone, fail, total: list.length };
}

// Gửi nội dung riêng cho từng máy: pick(sub) trả về payload hoặc null (bỏ qua máy đó).
export async function sendEach(pick, subject) {
  const db = (await readJSON(SUBS_FILE)) || { subs: {} };
  let ok = 0, gone = 0, fail = 0, skip = 0;
  await Promise.all(Object.entries(db.subs).map(async ([ep, s]) => {
    const payload = pick(s);
    if (!payload) { skip++; return; }
    try {
      const st = await sendOne(s, payload, subject);
      if (st >= 200 && st < 300) ok++;
      else if (st === 404 || st === 410) { delete db.subs[ep]; gone++; }
      else { fail++; console.error('push status', st); }
    } catch (e) { fail++; console.error('push error', e.message); }
  }));
  if (gone) { try { await writeJSON(SUBS_FILE, db); } catch (e) { console.error(e); } }
  return { ok, gone, fail, skip };
}
