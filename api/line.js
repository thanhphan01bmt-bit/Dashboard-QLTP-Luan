// Bot LINE: trong nhóm (đã được cấp quyền) gõ "dt" thì bot trả lời tóm tắt doanh thu toàn khu vực.
// Cần biến môi trường trên Vercel: LINE_CHANNEL_SECRET, LINE_CHANNEL_TOKEN, LINE_GROUPS (mã các nhóm được phép, cách nhau dấu phẩy).
// Gõ "dt id" trong nhóm để bot trả lời mã nhóm (dùng khi cài đặt).
// Gõ "menu" (hoặc "bc", "báo cáo") để hiện menu Mục tiêu ngày: bấm 1 mục thì bot gửi ảnh mục đó (ảnh tạo mỗi lần lưu số liệu).
import crypto from 'node:crypto';
import { json } from './_lib/auth.js';
import { readJSON, useRequest } from './_lib/store.js';
import { areaReply } from './_lib/summary.js';
import { IMG_KEYS, imgMeta, imgUrl } from './img.js';

const ASK = /^(dt|doanh thu|\/dt)$/i;
const MENU = /^(menu|bc|bao cao|\/menu)$/;
const SITE = 'https://luan56605.app/';
const noAcc = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');

// Menu Mục tiêu ngày (Flex Message): mỗi dòng gửi postback, bot trả lại ảnh của mục đó.
function menuMsg() {
  const item = (k, text) => ({ type: 'text', text, wrap: true, size: 'lg', weight: 'bold', color: '#1a3bd6', decoration: 'underline', margin: 'xl',
    action: { type: 'postback', label: text.slice(0, 40), data: `img=${k}` } }); // không có displayText: bấm vào không hiện câu chat
  return {
    type: 'flex', altText: 'Menu Mục tiêu ngày – Doanh thu khu vực QLTP Luân',
    contents: { type: 'bubble', size: 'mega', body: { type: 'box', layout: 'vertical', paddingAll: 'xl', contents: [
      { type: 'text', text: 'MỤC TIÊU NGÀY', weight: 'bold', size: 'xxl', color: '#4CAF50' },
      { type: 'text', text: 'Doanh thu khu vực QLTP Luân · bấm 1 mục để xem ảnh', size: 'sm', color: '#888888', margin: 'sm', wrap: true },
      { type: 'separator', margin: 'lg' },
      item('dt', '1. Doanh thu'),
      item('fresh', '2. Hiệu quả Fresh'),
      item('loss', '3. Hủy thủy hải sản'),
      item('egg', '4. Tỷ lệ bán trứng'),
      item('bill', '5. Lượt khách & giá trị bill'),
    ] } },
  };
}
const fmtVN = (iso) => { try { return new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); } catch { return ''; } };

async function reply(token, replyToken, msg) {
  const one = (x) => (typeof x === 'string' ? { type: 'text', text: x.slice(0, 4900) } : x);
  const m = Array.isArray(msg) ? msg.map(one) : one(msg);
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: Array.isArray(m) ? m : [m] }),
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
        // bấm 1 mục trong menu Mục tiêu ngày → gửi ảnh mục đó
        if (ev.type === 'postback' && ev.replyToken) {
          const src = ev.source || {}, id = src.groupId || src.roomId || src.userId || '';
          const k = new URLSearchParams(String((ev.postback || {}).data || '')).get('img');
          if (!IMG_KEYS[k]) continue;
          if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền xem doanh thu.'); continue; }
          const m = ((await imgMeta()) || {})[k];
          if (!m) { await reply(token, ev.replyToken, `Chưa có ảnh ${IMG_KEYS[k]}. Ảnh được tạo mỗi lần lưu số liệu trên dashboard.`); continue; }
          const u = imgUrl(new URL(req.url).origin, k, m.at);
          const img = { type: 'image', originalContentUrl: u, previewImageUrl: u };
          // mục Doanh thu: chỉ trả ảnh bảng doanh thu toàn khu vực
          if (k === 'dt') { await reply(token, ev.replyToken, img); continue; }
          await reply(token, ev.replyToken, [`${IMG_KEYS[k]} · toàn khu vực · số liệu lưu lúc ${fmtVN(m.at)}`, img]);
          continue;
        }
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
