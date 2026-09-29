import { json, fail, verifyLogin, sessionCookie, sameOriginWrite, readBody, sleep, ROLES } from './_lib/auth.js';

export default {
  async fetch(req) {
    if (req.method !== 'POST') return fail('Method not allowed', 405);
    if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);
    try {
      const { user, password } = await readBody(req, 10000);
      const who = user && password ? await verifyLogin(user, password) : null;
      if (!who) { await sleep(700); return fail('Sai tên đăng nhập hoặc mật khẩu.', 401); }
      return json({ u: who.u, name: who.name, role: who.role, roleName: ROLES[who.role] }, 200,
        { 'Set-Cookie': sessionCookie(who.u, who.pwVer || 0) });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
