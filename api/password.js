// Người dùng tự đổi mật khẩu của mình.
import { json, fail, currentUser, sameOriginWrite, readBody, loadUsers, saveUsers, checkPassword, hashPassword, sessionCookie, sleep } from './_lib/auth.js';
import { useRequest } from './_lib/store.js';

export default {
  async fetch(req) {
    useRequest(req);
    if (req.method !== 'POST') return fail('Method not allowed', 405);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
      if (me.env) return fail('Tài khoản quản trị chính đổi mật khẩu trong cài đặt Vercel (biến ADMIN_PASSWORD).', 400);
      const { oldPassword, newPassword } = await readBody(req, 10000);
      if (!newPassword || String(newPassword).length < 6) return fail('Mật khẩu mới cần ít nhất 6 ký tự.');
      const db = await loadUsers();
      const rec = db.users.find((x) => x.u === me.u);
      if (!rec || !(await checkPassword(oldPassword || '', rec.hash))) { await sleep(500); return fail('Mật khẩu hiện tại không đúng.', 401); }
      rec.hash = await hashPassword(newPassword);
      rec.pwVer = (rec.pwVer || 0) + 1;
      await saveUsers(db);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(rec.u, rec.pwVer) });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
