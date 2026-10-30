// Ảnh các mục Mục tiêu ngày (toàn khu vực) cho bot LINE.
// POST (quản trị / cập nhật dữ liệu, trang gửi sau mỗi lần lưu): { k, at, b64 } → lưu img/<k>.jpg.
// GET ?k=&v=&s=: trả ảnh cho LINE (link có chữ ký, không cần đăng nhập).
import crypto from 'node:crypto';
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest, readJSON, writeJSON, writeBuf, readBuf } from './_lib/store.js';

export const IMG_KEYS = { dt: 'Doanh thu', fresh: 'Hiệu quả Fresh', loss: 'Hủy thủy hải sản', egg: 'Tỷ lệ bán trứng', bill: 'Lượt khách & giá trị bill' };
const META = 'img/meta.json';
const sig = (k, v) => crypto.createHmac('sha256', String(process.env.SESSION_SECRET || '')).update(`img|${k}|${v}`).digest('base64url').slice(0, 24);
export const imgMeta = () => readJSON(META);
export const imgUrl = (origin, k, v) => `${origin}/api/img?k=${k}&v=${encodeURIComponent(v)}&s=${sig(k, v)}`;

export default {
  async fetch(req) {
    useRequest(req);
    try {
      if (req.method === 'GET') {
        const q = new URL(req.url).searchParams, k = q.get('k'), v = q.get('v') || '', s = q.get('s') || '';
        if (!IMG_KEYS[k] || !v || s.length !== 24 || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sig(k, v)))) return fail('Không có quyền.', 403);
        const buf = await readBuf(`img/${k}.jpg`);
        if (!buf) return fail('Chưa có ảnh.', 404);
        return new Response(buf, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
      }
      if (req.method === 'POST') {
        const me = await currentUser(req);
        if (!me) return fail('Chưa đăng nhập.', 401);
        if (me.role !== 'admin' && me.role !== 'editor') return fail('Không có quyền.', 403);
        if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
        const b = await readBody(req, 12 * 1024 * 1024);
        if (!IMG_KEYS[b.k] || !b.b64 || !b.at) return fail('Dữ liệu không hợp lệ.');
        const buf = Buffer.from(String(b.b64), 'base64');
        if (buf.length < 100 || buf.length > 9 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return fail('Ảnh không hợp lệ.');
        await writeBuf(`img/${b.k}.jpg`, buf, 'image/jpeg');
        const m = (await readJSON(META)) || {};
        m[b.k] = { at: String(b.at), size: buf.length };
        await writeJSON(META, m);
        return json({ ok: true });
      }
      return fail('Method not allowed', 405);
    } catch (e) { console.error(e); return fail(e.message || 'Lỗi máy chủ.', e.status || 500); }
  },
};
