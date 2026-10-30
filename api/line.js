// Bot LINE: trong nhóm (đã được cấp quyền) gõ "dt" thì bot trả lời tóm tắt doanh thu toàn khu vực.
// Cần biến môi trường trên Vercel: LINE_CHANNEL_SECRET, LINE_CHANNEL_TOKEN, LINE_GROUPS (mã các nhóm được phép, cách nhau dấu phẩy).
// Gõ "dt id" trong nhóm để bot trả lời mã nhóm (dùng khi cài đặt).
// Gõ "menu" (hoặc "bc", "báo cáo") để hiện menu báo cáo: bấm vào từng mục để mở đúng tab của dashboard.
import crypto from 'node:crypto';
import { json } from './_lib/auth.js';
import { readJSON, useRequest } from './_lib/store.js';
import { areaReply } from './_lib/summary.js';

const ASK = /^(dt|doanh thu|\/dt)$/i;
const MENU = /^(menu|bc|bao cao|\/menu)$/;
const SITE = 'https://luan56605.app/';
const noAcc = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

// Menu báo cáo (Flex Message): mỗi dòng là 1 liên kết mở dashboard ở trình duyệt ngoài (giữ đăng nhập), đúng tab.
function menuMsg() {
  const link = (text, hash) => ({ type: 'text', text, wrap: true, size: 'lg', weight: 'bold', color: '#1a3bd6', decoration: 'underline', margin: 'xl',
    action: { type: 'uri', label: text.slice(0, 40), uri: `${SITE}?openExternalBrowser=1${hash}` } });
  return {
    type: 'flex', altText: 'Menu báo cáo – Doanh thu khu vực QLTP Luân',
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', paddingAll: 'xl', contents: [
      { type: 'text', text: 'BÁO CÁO', weight: 'bold', size: 'xxl', color: '#4CAF50' },
      { type: 'text', text: 'Doanh thu khu vực QLTP Luân', size: 'sm', color: '#888888', margin: 'sm' },
      { type: 'separator', margin: 'lg' },
      link('Mục tiêu ngày (doanh thu, Fresh, hủy, trứng, bill)', '#muc-tieu'),
      link('Dashboard doanh thu tháng', '#dashboard'),
      link('Thi đua ngành hàng', '#nganh-hang'),
      link('Doanh thu năm', '#nam'),
      { type: 'text', text: 'Tóm tắt doanh thu ngay trong nhóm (gõ dt)', wrap: true, size: 'lg', weight: 'bold', color: '#1a3bd6', decoration: 'underline', margin: 'xl',
        action: { type: 'message', label: 'dt', text: 'dt' } },
    ] } },
  };
}

async function reply(token, replyToken, msg) {
  const m = typeof msg === 'string' ? { type: 'text', text: msg.slice(0, 4900) } : msg;
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [m] }),
  });
  if (!r.ok) console.error('LINE reply', r.status, await r.text().catch(() => ''));
}

export default {
  async fetch(req) {
    useRequest(req);
    if (req.method !== 'POST') return json({ ok: true, info: 'Webhook bot LINE của dashboard.' });
    const secret = process.env.LINE_CHANNEL_SECRET, token = process.env.LINE_CHANNEL_TOKEN;
    if (!secret || !token) return json({ error: 'Chưa cài LINE_CHANNEL_SECRET / LINE_CHANNEL_TOKEN.' }, 500);
    const raw = await req.text();
    // chỉ nhận yêu cầu thật sự do LINE gửi (chữ ký HMAC bằng Channel secret)
    const sig = Buffer.from(req.headers.get('x-line-signature') || '');
    const want = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'));
    if (sig.length !== want.length || !crypto.timingSafeEqual(sig, want)) return json({ error: 'Sai chữ ký.' }, 401);
    let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
    const allow = (process.env.LINE_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean);
    for (const ev of body.events || []) {
      try {
        if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || !ev.replyToken) continue;
        const t = String(ev.message.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const src = ev.source || {}, id = src.groupId || src.roomId || src.userId || '';
        if (t === 'dt id') { await reply(token, ev.replyToken, `Mã của nhóm / cuộc trò chuyện này:\n${id}\n\nGửi mã này cho quản trị dashboard để thêm vào LINE_GROUPS.`); continue; }
        const isMenu = MENU.test(noAcc(t));
        if (!ASK.test(t) && !isMenu) continue;
        if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền xem doanh thu. Gõ "dt id" để lấy mã nhóm rồi gửi quản trị dashboard.'); continue; }
        if (isMenu) { await reply(token, ev.replyToken, menuMsg()); continue; }
        const doc = await readJSON('data/current.json');
        await reply(token, ev.replyToken, doc && doc.data ? areaReply(doc.data, doc.meta) : 'Dashboard chưa có số liệu.');
      } catch (e) { console.error('line event', e); }
    }
    return json({ ok: true });
  },
};
