// Trả về giờ lưu số liệu gần nhất, để trang tự biết khi nào có số mới.
// Chỉ kiểm tra cookie và đọc 1 file rất nhỏ nên gần như không tốn hạn mức Blob.
import { json, fail, sessionOk } from './_lib/auth.js';
import { readJSON, useRequest } from './_lib/store.js';

export default {
  async fetch(req) {
    useRequest(req);
    if (!sessionOk(req)) return fail('Chưa đăng nhập.', 401);
    try {
      const meta = await readJSON('data/meta.json'); // đọc thẳng, không qua bộ đệm CDN (bộ đệm làm trang không thấy số mới vừa lưu)
      return json(meta ? { updatedAt: meta.updatedAt, by: meta.by, byName: meta.byName, sid: meta.sid || null } : { updatedAt: null });
    } catch (e) { return fail(e.message, e.status || 500); }
  },
};
