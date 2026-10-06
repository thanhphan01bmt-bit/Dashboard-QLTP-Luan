// Cài đặt thông báo tự động (quản trị): xem trạng thái, bật/tắt từng lịch.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest, readJSON, writeJSON } from './_lib/store.js';
import { JOBS, loadCfg } from './_lib/cronjob.js';

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me || me.role !== 'admin') return fail('Chỉ quản trị.', 403);
      if (req.method === 'GET') {
        return json({ jobs: JOBS, cfg: await loadCfg(), log: (await readJSON('push/auto-log.json')) || {}, cronSecret: !!process.env.CRON_SECRET });
      }
      if (req.method !== 'POST') return fail('Method not allowed', 405);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
      const b = await readBody(req, 5000);
      const cfg = await loadCfg();
      for (const k in JOBS) if (b.cfg && k in b.cfg) cfg[k] = !!b.cfg[k];
      await writeJSON('push/auto.json', cfg);
      return json({ ok: true, cfg });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
