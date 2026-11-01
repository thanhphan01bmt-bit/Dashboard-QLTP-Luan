// Bot LINE tự gửi ảnh mục 1. Doanh thu (toàn khu vực) vào các nhóm trong LINE_GROUPS.
// Chạy cùng lịch Tổng kết ngày (22h00) nếu đã bật "Bot LINE gửi ảnh Doanh thu" trong Thông báo tự động.
// Lưu ý: tin bot tự gửi vào nhóm được LINE tính = số thành viên trong nhóm (trừ hạn mức tin nhắn của gói).
import { imgMeta, imgUrl, IMG_KEYS } from '../img.js';
import { vnNow } from './summary.js';

const fmtVN = (iso) => { try { return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };
export const lineGroups = () => (process.env.LINE_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean);

// Kiểm tra trước: có gửi được không, gửi gì. force: bỏ qua điều kiện "số liệu đã lưu hôm nay" (dùng khi gửi thử).
export async function lineDtPlan(force = false) {
  const token = process.env.LINE_CHANNEL_TOKEN, groups = lineGroups();
  if (!token) return { skipped: 'Chưa cài LINE_CHANNEL_TOKEN' };
  if (!groups.length) return { skipped: 'Chưa có nhóm trong LINE_GROUPS' };
  const m = ((await imgMeta()) || {}).dt;
  if (!m) return { skipped: 'Chưa có ảnh Doanh thu (ảnh tạo khi lưu số liệu)' };
  const t = vnNow(), a = vnNow(new Date(m.at).getTime());
  if (!force && !(a.y === t.y && a.m === t.m && a.d === t.d)) return { skipped: 'Hôm nay chưa lưu số liệu mới' };
  return { token, groups, at: m.at, text: `${IMG_KEYS.dt} · toàn khu vực · số liệu lưu lúc ${fmtVN(m.at)}` };
}

export async function linePushDt(origin, force = false) {
  const p = await lineDtPlan(force);
  if (p.skipped) return { skipped: p.skipped };
  const base = process.env.SITE_URL ? process.env.SITE_URL.replace(/\/$/, '') : origin;
  const u = imgUrl(base, 'dt', p.at);
  let ok = 0, fail = 0;
  for (const to of p.groups) {
    try {
      const r = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, messages: [{ type: 'text', text: p.text }, { type: 'image', originalContentUrl: u, previewImageUrl: u }] }),
      });
      if (r.ok) ok++; else { fail++; console.error('LINE push', to, r.status, await r.text().catch(() => '')); }
    } catch (e) { fail++; console.error('LINE push', to, e); }
  }
  return { ok, fail, groups: p.groups.length };
}
