// Thông báo đẩy: lấy khóa công khai, đăng ký / hủy đăng ký nhận thông báo, gửi thử.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { readJSON, writeJSON, useRequest } from './_lib/store.js';
import { getVapid, sendAll, SUBS_FILE } from './_lib/webpush.js';

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      if (req.method === 'GET') return json({ publicKey: (await getVapid()).publicKey });
      if (req.method !== 'POST') return fail('Method not allowed', 405);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
      const b = await readBody(req, 20000);
      const origin = new URL(req.url).origin;

      if (b.action === 'subscribe') {
        const s = b.sub || {};
        if (!/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) return fail('Đăng ký thông báo không hợp lệ.');
        const db = (await readJSON(SUBS_FILE)) || { subs: {} };
        db.subs[s.endpoint] = { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, u: me.u, name: me.name, ua: String(b.ua || '').slice(0, 120), created: new Date().toISOString() };
        await writeJSON(SUBS_FILE, db);
        return json({ ok: true });
      }
      if (b.action === 'unsubscribe') {
        const db = (await readJSON(SUBS_FILE)) || { subs: {} };
        if (db.subs[b.endpoint]) { delete db.subs[b.endpoint]; await writeJSON(SUBS_FILE, db); }
        return json({ ok: true });
      }
      if (b.action === 'test') {
        const r = await sendAll({ title: 'DT KV Luân', body: `Thông báo thử cho ${me.name}. Bạn sẽ nhận tin như thế này khi có số liệu mới.`, url: '/', tag: 'kv-test' }, origin, (s) => s.u === me.u && (!b.endpoint || s.endpoint === b.endpoint));
        return json({ ok: true, ...r });
      }
      return fail('Thao tác không hợp lệ.');
    } catch (e) { console.error(e); return fail(e.message, e.status || 500); }
  },
};
