// Lưu bảng xếp hạng quản lý tính sẵn (quản trị / cập nhật dữ liệu), dùng khi số liệu hiện tại chưa có bảng này.
import { json, fail, currentUser, sameOriginWrite, readBody } from './_lib/auth.js';
import { useRequest, readJSON, writeJSON } from './_lib/store.js';

export default {
  async fetch(req) {
    useRequest(req);
    try {
      if (req.method !== 'POST') return fail('Method not allowed', 405);
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      if (me.role !== 'admin' && me.role !== 'editor') return fail('Không có quyền.', 403);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
      const b = await readBody(req, 500000);
      if (!b.rank || !Array.isArray(b.rank.rk)) return fail('Dữ liệu không hợp lệ.');
      const meta = await readJSON('data/meta.json');
      if (!meta || meta.updatedAt !== b.at) return fail('Số liệu đã thay đổi, bỏ qua.', 409);
      await writeJSON('data/rank.json', { at: b.at, rk: b.rank.rk, ot: Array.isArray(b.rank.ot) ? b.rank.ot : [] });
      return json({ ok: true });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
