// GET: mọi người đã đăng nhập đọc số liệu. POST: quản trị / cập nhật dữ liệu lưu số liệu mới.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest } from './_lib/store.js';
import { readJSON, writeJSON } from './_lib/store.js';
import { sendEach } from './_lib/webpush.js';
import { audience } from './_lib/audience.js';
import { shopNotice } from './_lib/summary.js';
import { shopOf, filterShop } from './_lib/scope.js';

const CURRENT = 'data/current.json';
const RANK = 'data/rank.json'; // bảng xếp hạng quản lý tính sẵn (cho tài khoản chỉ xem)

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
        const rank = await readJSON(RANK, { cache: true });
        if (me.role === 'viewer') {
          // Chỉ xem: chỉ nhận số liệu siêu thị của mình + bảng xếp hạng quản lý đã tính sẵn.
          const shop = shopOf(me, cur.data);
          if (!shop) return fail('Tài khoản chưa được gán siêu thị. Liên hệ quản trị để được gán siêu thị trong Quản lý tài khoản.', 403);
          if (shop !== 'all') {
            const rankSnap = rank && Array.isArray(rank.rk) ? { at: rank.at, rk: rank.rk, ot: rank.ot || [] } : null;
            return json({ meta: cur.meta, data: { ...filterShop(cur.data, shop), rankSnap, viewer: { shop } } });
          }
        }
        return json({ ...cur, rankAt: (rank && rank.at) || null });
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
        try { await writeJSON('data/meta.json', doc.meta); } catch (e) { console.error('meta failed', e); }
        if (body.rank && Array.isArray(body.rank.rk)) {
          try { await writeJSON(RANK, { at: doc.meta.updatedAt, rk: body.rank.rk, ot: Array.isArray(body.rank.ot) ? body.rank.ot : [] }); } catch (e) { console.error('rank failed', e); }
        }
        // Sao lưu mỗi ngày 1 bản (ghi đè trong ngày), giờ Việt Nam.
        const vn = new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
        try { await writeJSON(`backup/${vn}.json`, doc); } catch (e) { console.error('backup failed', e); }
        // Gửi thông báo đẩy cho các máy đã bật (trừ máy của người vừa lưu), tối đa 8 giây.
        const hm = new Date(now.getTime() + 7 * 3600e3).toISOString().slice(11, 16);
        const timeout = (ms) => new Promise((r) => setTimeout(() => r({ timeout: true }), ms));
        const pushJob = (async () => {
          try {
            const notice = String(body.notice || '').replace(/\s+/g, ' ').trim().slice(0, 180) || `Số liệu đã được cập nhật lúc ${hm}.`;
            // cả khu vực: tóm tắt toàn khu vực; tài khoản chỉ xem 1 siêu thị: chỉ số liệu siêu thị đó
            const who = await audience(data);
            const per = {};
            const pick = (sub) => {
              if (sub.u === me.u) return null;
              const sc = who(sub.u);
              if (!sc) return null;
              const body = sc === 'all' ? notice : (per[sc] ??= shopNotice(data, doc.meta, sc) || `Số liệu đã được cập nhật lúc ${hm}.`);
              return { title: 'DT KV Luân · số liệu mới', body, url: '/#muctieu', tag: 'kv-update' };
            };
            return await Promise.race([sendEach(pick, new URL(req.url).origin), timeout(8000)]);
          } catch (e) { console.error('push failed', e); return null; }
        })();
        const push = await pushJob;
        return json({ ok: true, meta: doc.meta, push });
      }
      return fail('Method not allowed', 405);
    } catch (e) { console.error(e); return fail(e.message || 'Lỗi máy chủ.', e.status || 500); }
  },
};
