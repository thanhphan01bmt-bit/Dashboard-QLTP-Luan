// GET: mọi người đã đăng nhập đọc số liệu. POST: quản trị / cập nhật dữ liệu lưu số liệu mới.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest } from './_lib/store.js';
import { readJSON, writeJSON } from './_lib/store.js';

const CURRENT = 'data/current.json';

function looksValid(d) {
  return d && typeof d === 'object' && d.shops && d.cur && d.prev && d.aug && d.sep
    && Object.keys(d.shops).length > 0 && Number.isFinite(+d.cur.m) && Number.isFinite(+d.cur.y);
}

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);

      if (req.method === 'GET') {
        const cur = await readJSON(CURRENT);
        if (!cur) return fail('Chưa có dữ liệu.', 404);
        return json(cur);
      }

      if (req.method === 'POST') {
        if (me.role !== 'admin' && me.role !== 'editor') return fail('Tài khoản của bạn chỉ được xem.', 403);
        if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
        const body = await readBody(req);
        const data = body && body.data;
        if (!looksValid(data)) return fail('Dữ liệu không đúng định dạng dashboard.', 400);
        const prev = await readJSON(CURRENT);
        // Chỉ quản trị được đổi % mục tiêu tăng trưởng.
        if (me.role !== 'admin') data.goalPct = (prev && prev.data && prev.data.goalPct) || 0;
        // Chống ghi đè khi 2 người lưu cùng lúc: client gửi mốc cập nhật mình đang xem.
        if (prev && body.baseUpdatedAt && prev.meta && prev.meta.updatedAt !== body.baseUpdatedAt && !body.force) {
          return json({ error: 'conflict', meta: prev.meta }, 409);
        }
        const now = new Date();
        const doc = { meta: { updatedAt: now.toISOString(), by: me.u, byName: me.name }, data };
        await writeJSON(CURRENT, doc);
        // Sao lưu mỗi ngày 1 bản (ghi đè trong ngày), giờ Việt Nam.
        const vn = new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
        try { await writeJSON(`backup/${vn}.json`, doc); } catch (e) { console.error('backup failed', e); }
        return json({ ok: true, meta: doc.meta });
      }
      return fail('Method not allowed', 405);
    } catch (e) { console.error(e); return fail(e.message || 'Lỗi máy chủ.', e.status || 500); }
  },
};
