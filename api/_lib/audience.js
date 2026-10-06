// Mỗi tài khoản nhận thông báo theo phạm vi được xem: 'all' (cả khu vực), mã siêu thị, hoặc null (không gửi).
import { loadUsers, envAdmin } from './auth.js';
import { shopOf } from './scope.js';

export async function audience(data) {
  const db = await loadUsers(true), ea = envAdmin();
  const map = new Map(db.users.map((u) => [u.u, u]));
  return (u) => {
    if (ea && u === ea.u) return 'all';
    const r = map.get(u);
    if (!r || r.disabled) return null;
    if (r.role === 'admin' || r.role === 'editor') return 'all';
    return shopOf({ u: r.u, shop: r.shop || '' }, data);
  };
}
