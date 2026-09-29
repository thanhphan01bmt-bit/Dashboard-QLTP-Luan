import { json, fail, currentUser, ROLES } from './_lib/auth.js';

export default {
  async fetch(req) {
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      return json({ u: me.u, name: me.name, role: me.role, roleName: ROLES[me.role], envAdmin: !!me.env });
    } catch (e) { return fail(e.message, 500); }
  },
};
