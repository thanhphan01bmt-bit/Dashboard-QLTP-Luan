// GET: mọi người đã đăng nhập đọc số liệu. POST: quản trị / cập nhật dữ liệu lưu số liệu mới.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest } from './_lib/store.js';
import { readJSON, writeJSON, listNames } from './_lib/store.js';
import { sendEach } from './_lib/webpush.js';
import { audience } from './_lib/audience.js';
import { shopNotice } from './_lib/summary.js';
import { shopOf, filterShop } from './_lib/scope.js';

const CURRENT = 'data/current.json';
const RANK = 'data/rank.json'; // bảng xếp hạng quản lý tính sẵn (cho tài khoản chỉ xem)
// Số liệu chốt của từng tháng (lần lưu cuối của tháng đó): months/YYYY-MM.json — để xem lại tháng cũ.
const MONTH = /^\d{4}-\d{2}$/;
const monthKey = (d) => d && d.cur ? `${d.cur.y}-${String(d.cur.m).padStart(2, '0')}` : null;

// Tháng chưa có file chốt (trước khi có tính năng này): lấy bản sao lưu cuối cùng có số liệu của tháng đó.
async function monthDoc(m) {
  const doc = await readJSON(`months/${m}.json`);
  if (doc) return doc;
  const [y, mo] = m.split('-').map(Number);
  const nx = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  const names = (await listNames('backup/')).map((b) => b.name).filter((n) => /\/\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .filter((n) => { const d = n.slice(7, 17); return d.startsWith(m) || (d.startsWith(nx) && +d.slice(8) <= 5); }).sort().reverse();
  for (const n of names.slice(0, 8)) { const d = await readJSON(n); if (d && monthKey(d.data) === m) return d; }
  return null;
}
async function monthList() {
  const set = new Set();
  for (const b of await listNames('months/')) { const k = b.name.slice(7, 14); if (MONTH.test(k)) set.add(k); }
  for (const b of await listNames('backup/')) { const k = b.name.slice(7, 14); if (MONTH.test(k)) set.add(k); }
  return [...set].sort().reverse();
}

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
        const q = new URL(req.url).searchParams;
        if (q.get('months')) return json({ months: await monthList() });
        const am = q.get('m');
        if (am) {
          // xem lại kết quả tháng cũ (chỉ xem, không sửa)
          if (!MONTH.test(am)) return fail('Tháng không hợp lệ.');
          const doc = await monthDoc(am);
          if (!doc || !doc.data) return fail('Chưa có số liệu của tháng này.', 404);
          if (me.role === 'viewer') {
            const shop = shopOf(me, doc.data);
            if (!shop) return fail('Tài khoản của bạn không có số liệu trong tháng này.', 403);
            if (shop !== 'all') {
              const rk = doc.rank && Array.isArray(doc.rank.rk) ? { at: doc.meta && doc.meta.updatedAt, rk: doc.rank.rk, ot: doc.rank.ot || [] } : null;
              return json({ meta: doc.meta, archived: am, data: { ...filterShop(doc.data, shop), rankSnap: rk, viewer: { shop } } });
            }
          }
          return json({ meta: doc.meta, archived: am, data: doc.data });
        }
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
        // lưu bảng xếp hạng quản lý tính sẵn cho số liệu hiện tại (khi chưa có, vd. sau khôi phục bản sao lưu)
        if (body && body.action === 'rank') {
          if (!body.rank || !Array.isArray(body.rank.rk)) return fail('Dữ liệu không hợp lệ.');
          const mt = await readJSON('data/meta.json');
          if (!mt || mt.updatedAt !== body.at) return fail('Số liệu đã thay đổi, bỏ qua.', 409);
          await writeJSON(RANK, { at: body.at, rk: body.rank.rk, ot: Array.isArray(body.rank.ot) ? body.rank.ot : [] });
          return json({ ok: true });
        }
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
        // mã lần lưu: trang dùng để biết đã lưu được chưa khi mất kết nối lúc chờ phản hồi
        if (body.saveId) doc.meta.sid = String(body.saveId).slice(0, 40);
        await writeJSON(CURRENT, doc);
        try { await writeJSON('data/meta.json', doc.meta); } catch (e) { console.error('meta failed', e); }
        if (body.rank && Array.isArray(body.rank.rk)) {
          try { await writeJSON(RANK, { at: doc.meta.updatedAt, rk: body.rank.rk, ot: Array.isArray(body.rank.ot) ? body.rank.ot : [] }); } catch (e) { console.error('rank failed', e); }
        }
        // Sao lưu mỗi ngày 1 bản (ghi đè trong ngày), giờ Việt Nam.
        const vn = new Date(now.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
        try { await writeJSON(`backup/${vn}.json`, doc); } catch (e) { console.error('backup failed', e); }
        // chốt số liệu của tháng đang lưu (ghi đè mỗi lần lưu, lần cuối cùng của tháng là kết quả cả tháng)
        const mk = monthKey(data);
        if (mk) { try { await writeJSON(`months/${mk}.json`, { ...doc, rank: body.rank && Array.isArray(body.rank.rk) ? { rk: body.rank.rk, ot: Array.isArray(body.rank.ot) ? body.rank.ot : [] } : null }); } catch (e) { console.error('month failed', e); } }
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
