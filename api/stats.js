// Thống kê lượt xem: mỗi tài khoản ghi tối đa 1 lần mỗi ngày (giờ Việt Nam) để tiết kiệm hạn mức Blob.
// POST: ghi nhận "hôm nay đã xem" cho người đang đăng nhập. GET ?m=YYYY-MM: quản trị xem thống kê tháng.
import { json, fail, currentUser, sameOriginWrite, loadUsers, envAdmin, ROLES } from './_lib/auth.js';
import { readJSON, writeJSON, useRequest } from './_lib/store.js';
import { SUBS_FILE } from './_lib/webpush.js';

const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const vnDay = () => vnNow().toISOString().slice(0, 10);
const file = (m) => `stats/${m}.json`;

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);

      if (req.method === 'POST') {
        if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
        const day = vnDay(), m = day.slice(0, 7);
        const st = (await readJSON(file(m))) || { users: {} };
        const rec = st.users[me.u] || (st.users[me.u] = { days: [] });
        if (rec.days.includes(day)) return json({ ok: true, already: true });
        rec.days.push(day); rec.days.sort();
        rec.first = rec.first || {}; rec.first[day] = new Date().toISOString();
        rec.name = me.name; rec.role = me.role;
        await writeJSON(file(m), st);
        return json({ ok: true });
      }

      if (req.method === 'GET') {
        if (me.role !== 'admin') return fail('Chỉ quản trị xem được thống kê.', 403);
        const m = new URL(req.url).searchParams.get('m') || vnDay().slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(m)) return fail('Tháng không hợp lệ.');
        const [st, db, subs] = await Promise.all([readJSON(file(m)), loadUsers(), readJSON(SUBS_FILE).catch(() => null)]);
        const P = {}; Object.values((subs && subs.subs) || {}).forEach((x) => { P[x.u] = (P[x.u] || 0) + 1; });
        const S = (st && st.users) || {};
        const ea = envAdmin();
        const list = [];
        if (ea) list.push({ u: ea.u, name: ea.name, role: 'admin' });
        db.users.forEach((x) => list.push({ u: x.u, name: x.name || x.u, role: x.role, disabled: !!x.disabled }));
        // tài khoản đã xóa nhưng vẫn còn lượt xem trong tháng
        Object.keys(S).forEach((u) => { if (!list.some((x) => x.u === u)) list.push({ u, name: S[u].name || u, role: S[u].role, deleted: true }); });
        const users = list.map((x) => ({ ...x, roleName: ROLES[x.role] || '', days: (S[x.u] && S[x.u].days) || [], first: (S[x.u] && S[x.u].first) || {}, push: P[x.u] || 0 }));
        return json({ month: m, today: vnDay(), users });
      }
      return fail('Method not allowed', 405);
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
