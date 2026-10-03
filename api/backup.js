// Sao lưu & khôi phục (chỉ quản trị).
// GET: danh sách bản sao lưu theo ngày (+ bản "trước khi khôi phục" nếu có).
// GET ?d=YYYY-MM-DD: tải nguyên bản sao lưu của ngày đó.
// POST {action:'restore', date} | {action:'undo'}.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest, readJSON, writeJSON, listNames, deleteName } from './_lib/store.js';

const CURRENT = 'data/current.json';
const UNDO = 'backup/_truoc-khoi-phuc.json';
const KEEP_DAYS = 120; // bản sao lưu cũ hơn số ngày này sẽ tự xóa khi mở danh sách
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Tóm tắt 1 bản: số liệu đến ngày nào, tháng nào.
const brief = (doc) => {
  const d = (doc && doc.data) || {};
  return { updatedAt: doc && doc.meta && doc.meta.updatedAt, byName: doc && doc.meta && (doc.meta.byName || doc.meta.by), m: d.cur && d.cur.m, y: d.cur && d.cur.y, day: d.sep && d.sep.days };
};

async function setCurrent(data, me, note) {
  const doc = { meta: { updatedAt: new Date().toISOString(), by: me.u, byName: me.name, restored: note }, data };
  await writeJSON(CURRENT, doc);
  try { await writeJSON('data/meta.json', doc.meta); } catch (e) { console.error('meta failed', e); }
  return doc.meta;
}

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      if (me.role !== 'admin') return fail('Chỉ quản trị được dùng sao lưu.', 403);
      const url = new URL(req.url);

      if (req.method === 'GET') {
        const d = url.searchParams.get('d');
        if (d) {
          if (!DATE.test(d)) return fail('Ngày không hợp lệ.');
          const doc = await readJSON(`backup/${d}.json`);
          return doc ? json(doc) : fail('Không có bản sao lưu ngày này.', 404);
        }
        const all = await listNames('backup/');
        const cutoff = new Date(Date.now() + 7 * 3600e3 - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
        const days = [];
        for (const f of all) {
          const m = f.name.match(/^backup\/(\d{4}-\d{2}-\d{2})\.json$/);
          if (!m) continue;
          if (m[1] < cutoff) { try { await deleteName(f.name); } catch (e) { console.error('prune failed', e); } continue; }
          days.push({ date: m[1], size: f.size, savedAt: f.uploadedAt });
        }
        days.sort((a, b) => b.date.localeCompare(a.date));
        const undo = all.some((f) => f.name === UNDO) ? brief(await readJSON(UNDO)) : null;
        const cur = await readJSON(CURRENT);
        return json({ days, undo, current: cur ? { ...brief(cur), restored: cur.meta && cur.meta.restored } : null, keepDays: KEEP_DAYS });
      }

      if (req.method !== 'POST') return fail('Method not allowed', 405);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
      const b = await readBody(req, 10000);
      const cur = await readJSON(CURRENT);

      if (b.action === 'restore') {
        if (!DATE.test(String(b.date || ''))) return fail('Ngày không hợp lệ.');
        const bk = await readJSON(`backup/${b.date}.json`);
        if (!bk || !bk.data) return fail('Không đọc được bản sao lưu ngày này.', 404);
        if (cur) await writeJSON(UNDO, cur); // giữ số liệu hiện tại để hoàn tác
        const [y, m, d] = b.date.split('-');
        const meta = await setCurrent(bk.data, me, `bản sao lưu ngày ${+d}/${+m}/${y}`);
        return json({ ok: true, meta });
      }
      if (b.action === 'undo') {
        const u = await readJSON(UNDO);
        if (!u || !u.data) return fail('Không có gì để hoàn tác.', 404);
        if (cur) await writeJSON(UNDO, cur); // hoán đổi: bấm lần nữa để quay lại
        const meta = await setCurrent(u.data, me, 'hoàn tác lần khôi phục');
        return json({ ok: true, meta });
      }
      return fail('Thao tác không hợp lệ.');
    } catch (e) { console.error(e); return fail(e.message || 'Lỗi máy chủ.', e.status || 500); }
  },
};
