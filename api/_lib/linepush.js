// Bot LINE tự gửi ảnh mục 1. Doanh thu (toàn khu vực) vào các nhóm trong LINE_GROUPS.
// Tin có tag @All cả nhóm (tắt: đặt biến môi trường LINE_TAG_ALL=0).
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
  // tag cả nhóm (@All) ở đầu tin: tin nhắn văn bản v2 với mention "all"; nếu LINE từ chối thì gửi lại tin thường không tag
  const img = { type: 'image', originalContentUrl: u, previewImageUrl: u };
  const tagAll = process.env.LINE_TAG_ALL !== '0';
  const txtAll = { type: 'textV2', text: `{all} ${p.text}`, substitution: { all: { type: 'mention', mentionee: { type: 'all' } } } };
  const send = (to, messages) => fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, messages }),
  });
  for (const to of p.groups) {
    try {
      let r = await send(to, [tagAll ? txtAll : { type: 'text', text: p.text }, img]);
      if (!r.ok && tagAll && r.status === 400) { console.error('LINE push @All', to, await r.text().catch(() => '')); r = await send(to, [{ type: 'text', text: p.text }, img]); }
      if (r.ok) ok++; else { fail++; console.error('LINE push', to, r.status, await r.text().catch(() => '')); }
    } catch (e) { fail++; console.error('LINE push', to, e); }
  }
  return { ok, fail, groups: p.groups.length };
}
