// Thông báo tự động theo lịch (Vercel Cron, giờ UTC trong vercel.json):
//   /api/cron/morning  07:00  · /api/cron/evening 22:00 · /api/cron/weekly thứ Hai 08:00 · /api/cron/monthly ngày 1 08:00 (giờ VN)
// Vercel gọi kèm "Authorization: Bearer <CRON_SECRET>". Quản trị có thể xem trước (?mode=preview) hoặc gửi thử cho máy mình (?mode=test).
import { json, fail, currentUser } from './auth.js';
import { useRequest, readJSON, writeJSON } from './store.js';
import { sendEach } from './webpush.js';
import { audience } from './audience.js';
import { morning, evening, weekly, monthly, vnNow } from './summary.js';

export const JOBS = {
  morning: 'Mục tiêu hôm nay (7h00)',
  evening: 'Tổng kết ngày (22h00)',
  weekly: 'Tổng kết tuần (thứ Hai 8h00)',
  monthly: 'Chốt tháng (ngày 1, 8h00)',
};
const CFG = 'push/auto.json', LOG = 'push/auto-log.json', WEEK_PREV = 'rank/week-last.json';

export async function loadCfg() { const c = (await readJSON(CFG)) || {}; const o = {}; for (const k in JOBS) o[k] = c[k] !== false; return o; }

async function build(job, cur, rank) {
  const { data, meta } = cur;
  if (job === 'morning') return morning(data, meta);
  if (job === 'evening') return evening(data, meta);
  if (job === 'weekly') return weekly(data, meta, rank, await readJSON(WEEK_PREV));
  if (job === 'monthly') return monthly(data, meta, rank);
  return null;
}

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const url = new URL(req.url);
      const job = url.pathname.split('/').pop();
      if (!JOBS[job]) return fail('Không có lịch này.', 404);
      const secret = process.env.CRON_SECRET;
      const isCron = !!secret && req.headers.get('authorization') === `Bearer ${secret}`;
      let me = null, mode = 'cron';
      if (!isCron) {
        me = await currentUser(req);
        if (!me || me.role !== 'admin') return fail('Không có quyền.', 401);
        mode = url.searchParams.get('mode') === 'test' ? 'test' : 'preview';
      }
      const cur = await readJSON('data/current.json');
      if (!cur || !cur.data) return json({ ok: false, reason: 'Chưa có số liệu.' });
      const rank = await readJSON('data/rank.json');
      const msgs = await build(job, cur, rank);
      const names = Object.fromEntries(Object.entries(cur.data.shops || {}).map(([s, o]) => [s, o.name || s]));

      if (mode === 'preview') return json({ job, label: JOBS[job], at: vnNow().date.toISOString(), area: msgs.area, shops: msgs.shops, names });

      const payloadFor = (scope) => {
        const m = scope === 'all' ? msgs.area : msgs.shops[scope];
        return m ? { title: m.title, body: m.body, url: '/', tag: 'kv-auto-' + job } : null;
      };
      const origin = url.origin;
      if (mode === 'test') {
        const r = await sendEach((s) => (s.u === me.u ? payloadFor('all') : null), origin);
        return json({ ok: true, test: true, ...r, empty: !msgs.area });
      }

      // chạy theo lịch
      const cfg = await loadCfg();
      let res = { skipped: 'Đang tắt' };
      if (cfg[job]) {
        if (!msgs.area) res = { skipped: 'Không có số liệu phù hợp' };
        else { const who = await audience(cur.data); res = await sendEach((s) => payloadFor(who(s.u)), origin); }
      }
      if (job === 'weekly' && rank && rank.rk) { try { await writeJSON(WEEK_PREV, rank); } catch (e) { console.error(e); } }
      if (job === 'monthly' && rank && rank.rk) { try { await writeJSON(`rank/month/${cur.data.cur.y}-${String(cur.data.cur.m).padStart(2, '0')}.json`, rank); } catch (e) { console.error(e); } }
      try { const log = (await readJSON(LOG)) || {}; log[job] = { at: new Date().toISOString(), ...res }; await writeJSON(LOG, log); } catch (e) { console.error(e); }
      return json({ ok: true, job, ...res });
    } catch (e) { console.error(e); return fail(e.message || 'Lỗi máy chủ.', e.status || 500); }
  },
};
