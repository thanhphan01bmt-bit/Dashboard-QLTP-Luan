// Quản lý tài khoản (chỉ quản trị): xem danh sách, thêm, đổi quyền, đặt lại mật khẩu, khóa/mở, xóa.
import { json, fail, currentUser, sameOriginWrite, readBody, loadUsers, saveUsers, hashPassword, normUser, validUser, envAdmin, ROLES } from './_lib/auth.js';
import { useRequest } from './_lib/store.js';

const pub = (x) => ({ u: x.u, name: x.name || x.u, role: x.role, disabled: !!x.disabled, created: x.created, updated: x.updated });

export default {
  async fetch(req) {
    useRequest(req);
    try {
      const me = await currentUser(req);
      if (!me) return fail('Chưa đăng nhập.', 401);
      if (me.role !== 'admin') return fail('Chỉ quản trị được quản lý tài khoản.', 403);
      const db = await loadUsers(true);
      const ea = envAdmin();

      if (req.method === 'GET') {
        return json({ envAdmin: ea ? { u: ea.u, name: ea.name } : null, users: db.users.map(pub), roles: ROLES });
      }
      if (req.method !== 'POST') return fail('Method not allowed', 405);
      if (!sameOriginWrite(req)) return fail('Yêu cầu không hợp lệ.', 403);

      const b = await readBody(req, 20000);
      const u = normUser(b.u);
      if (ea && u === ea.u) return fail('Tài khoản quản trị chính được cài trong Vercel, không sửa ở đây.');
      const rec = db.users.find((x) => x.u === u);
      const now = new Date().toISOString();
      const roleOk = (r) => Object.prototype.hasOwnProperty.call(ROLES, r);

      switch (b.action) {
        case 'create': {
          if (!validUser(u)) return fail('Tên đăng nhập 3–32 ký tự, chỉ gồm chữ thường không dấu, số, dấu chấm, gạch dưới, gạch ngang.');
          if (rec) return fail('Tên đăng nhập này đã có.');
          if (!roleOk(b.role)) return fail('Quyền không hợp lệ.');
          if (!b.password || String(b.password).length < 6) return fail('Mật khẩu cần ít nhất 6 ký tự.');
          db.users.push({ u, name: String(b.name || u).slice(0, 60), role: b.role, hash: await hashPassword(b.password), pwVer: 0, created: now, updated: now });
          break;
        }
        case 'update': {
          if (!rec) return fail('Không tìm thấy tài khoản.', 404);
          if (b.role !== undefined) { if (!roleOk(b.role)) return fail('Quyền không hợp lệ.'); rec.role = b.role; }
          if (b.name !== undefined) rec.name = String(b.name || u).slice(0, 60);
          if (b.disabled !== undefined) rec.disabled = !!b.disabled;
          rec.updated = now;
          break;
        }
        case 'reset': {
          if (!rec) return fail('Không tìm thấy tài khoản.', 404);
          if (!b.password || String(b.password).length < 6) return fail('Mật khẩu cần ít nhất 6 ký tự.');
          rec.hash = await hashPassword(b.password);
          rec.pwVer = (rec.pwVer || 0) + 1; // đăng xuất các phiên cũ
          rec.updated = now;
          break;
        }
        case 'delete': {
          if (!rec) return fail('Không tìm thấy tài khoản.', 404);
          if (u === me.u) return fail('Không tự xóa tài khoản đang đăng nhập.');
          db.users = db.users.filter((x) => x.u !== u);
          break;
        }
        default: return fail('Thao tác không hợp lệ.');
      }
      await saveUsers(db);
      return json({ ok: true, users: db.users.map(pub) });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
