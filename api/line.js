// Bot LINE: trong nhóm (đã được cấp quyền) gõ "dt" thì bot trả lời tóm tắt doanh thu toàn khu vực.
// Cần biến môi trường trên Vercel: LINE_CHANNEL_SECRET, LINE_CHANNEL_TOKEN, LINE_GROUPS (mã các nhóm được phép, cách nhau dấu phẩy).
// Gõ "dt id" trong nhóm để bot trả lời mã nhóm (dùng khi cài đặt).
import crypto from 'node:crypto';
import { json } from './_lib/auth.js';
import { readJSON, useRequest } from './_lib/store.js';
import { areaReply } from './_lib/summary.js';

const ASK = /^(dt|doanh thu|\/dt)$/i;

async function reply(token, replyToken, text) {
  const r = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
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
        if (!ASK.test(t)) continue;
        if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền xem doanh thu. Gõ "dt id" để lấy mã nhóm rồi gửi quản trị dashboard.'); continue; }
        const doc = await readJSON('data/current.json');
        await reply(token, ev.replyToken, doc && doc.data ? areaReply(doc.data, doc.meta) : 'Dashboard chưa có số liệu.');
      } catch (e) { console.error('line event', e); }
    }
    return json({ ok: true });
  },
};
