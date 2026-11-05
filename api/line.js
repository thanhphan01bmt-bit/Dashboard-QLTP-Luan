// Bot LINE: trong nhóm (đã được cấp quyền) gõ "dt" thì bot trả lời tóm tắt doanh thu toàn khu vực.
// Cần biến môi trường trên Vercel: LINE_CHANNEL_SECRET, LINE_CHANNEL_TOKEN, LINE_GROUPS (mã các nhóm được phép, cách nhau dấu phẩy).
// Gõ "dt id" trong nhóm để bot trả lời mã nhóm (dùng khi cài đặt).
// Gõ "menu" (hoặc "bc", "báo cáo") để hiện menu Mục tiêu ngày: bấm 1 mục thì bot gửi ảnh mục đó (ảnh tạo mỗi lần lưu số liệu).
// Quản lý tự đăng ký 1 lần trong nhóm: "dt dk <mã siêu thị hoặc user QL>" → bot tag tên khi siêu thị cần nhắc (Hủy thủy hải sản / Bán trứng, từ 21h).
// "dt huy dk": bỏ đăng ký của mình · "dt ds": xem siêu thị nào đã / chưa có quản lý đăng ký.
import crypto from 'node:crypto';
import { json } from './_lib/auth.js';
import { readJSON, writeJSON, useRequest } from './_lib/store.js';
import { areaReply, vnNow } from './_lib/summary.js';
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

// tag: gắn @All (tag cả nhóm) vào đầu tin trả lời — chỉ dùng trong nhóm / phòng chat, tắt bằng LINE_TAG_ALL=0
async function reply(token, replyToken, msg, tag = false) {
  const one = (x) => (typeof x === 'string' ? { type: 'text', text: x.slice(0, 4900) } : x);
  const plain = (Array.isArray(msg) ? msg : [msg]).map(one);
  let tagged = null;
  if (tag && process.env.LINE_TAG_ALL !== '0') {
    const all = (t) => ({ type: 'textV2', text: `{all} ${t.replace(/[{}]/g, (c) => c + c)}`.slice(0, 4900), substitution: { all: { type: 'mention', mentionee: { type: 'all' } } } });
    const i = plain.findIndex((x) => x.type === 'text');
    tagged = plain.slice();
    if (i >= 0) tagged[i] = all(plain[i].text);
    else if (tagged.length < 5) tagged.unshift(all('Mục tiêu ngày · bấm 1 mục bên dưới để xem ảnh'));
  }
  const send = (messages) => fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages }),
  });
  let r = await send(tagged || plain);
  // LINE từ chối tin có tag (400) thì gửi lại tin thường
  if (!r.ok && tagged && r.status === 400) { console.error('LINE reply @All', await r.text().catch(() => '')); r = await send(plain); }
  if (!r.ok) console.error('LINE reply', r.status, await r.text().catch(() => ''));
}

const REG = 'line/reg.json'; // { mã siêu thị: { u: userId LINE, n: tên LINE, at } }
const NAG_HOUR = 21; // chỉ tag quản lý ở ảnh Hủy thủy hải sản / Bán trứng từ 21h00 (giờ VN)
const isUid = (u) => /^U[0-9a-f]{32}$/.test(u || '');
async function lineName(token, src) {
  try {
    const path = src.groupId ? `group/${src.groupId}/member/${src.userId}` : src.roomId ? `room/${src.roomId}/member/${src.userId}` : `profile/${src.userId}`;
    const r = await fetch(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return r.ok ? ((await r.json()).displayName || '') : '';
  } catch { return ''; }
}
// tìm siêu thị theo mã siêu thị hoặc user QL (không phân biệt hoa thường)
const findShops = (shops, q) => { const k = String(q || '').trim().toLowerCase(); if (!k) return []; if (shops[k] || shops[q]) return [shops[q] ? q : k]; return Object.keys(shops).filter((s) => String(shops[s].ql || '').trim().toLowerCase() === k); };

// Ảnh Hủy thủy hải sản / Bán trứng: chỉ tag quản lý các siêu thị cần nhắc (danh sách lưu kèm ảnh khi lưu số liệu).
// Tài khoản LINE của quản lý: quản lý tự đăng ký trong nhóm (dt dk), chưa có thì lấy cột LINE trong file Base (nếu có).
const NEED = { loss: ['⚠️ Hủy thủy hải sản trên 10%:', '✅ Không có siêu thị hủy thủy hải sản trên 10%.'], egg: ['⚠️ Bán trứng 3 ngày liền dưới 100%:', '✅ Không có siêu thị bán trứng 3 ngày liền dưới 100%.'] };
async function nagMsgs(k, m, head) {
  const tags = Array.isArray(m.tag) ? m.tag : null;
  if (!tags) return null; // ảnh lưu trước khi có tính năng: trả lời như cũ
  if (!tags.length) return { tagged: [{ type: 'text', text: `${head}\n${NEED[k][1]}` }], plain: null };
  const doc = await readJSON('data/current.json');
  const shops = (doc && doc.data && doc.data.shops) || {}, reg = (await readJSON(REG)) || {};
  const esc = (t) => String(t).replace(/[{}]/g, (c) => c + c);
  const rows = tags.map((s) => { const i = shops[s] || {}; return { s, shop: i.name || s, ql: i.qlName || '', line: isUid((reg[s] || {}).u) ? reg[s].u : isUid(i.line) ? i.line : null }; });
  const plainLines = rows.map((r) => `• ${r.ql ? r.ql + ' – ' : ''}${r.shop}`);
  // tối đa 20 người được tag trong 1 tin: chia nhiều tin nếu cần
  const tagged = [], plain = [{ type: 'text', text: [head, NEED[k][0], ...plainLines].join('\n').slice(0, 4900) }];
  for (let i = 0; i < rows.length; i += 20) {
    const part = rows.slice(i, i + 20), sub = {};
    const lines = part.map((r, j) => { if (!r.line) return `• ${esc(r.ql ? r.ql + ' – ' : '')}${esc(r.shop)}`; const key = 'q' + j; sub[key] = { type: 'mention', mentionee: { type: 'user', userId: r.line } }; return `• {${key}} – ${esc(r.shop)}`; });
    const text = (i === 0 ? [esc(head), NEED[k][0]] : []).concat(lines).join('\n').slice(0, 4900);
    tagged.push(Object.keys(sub).length ? { type: 'textV2', text, substitution: sub } : { type: 'text', text: text.replace(/\{\{/g, '{').replace(/\}\}/g, '}') });
  }
  return { tagged: tagged.slice(0, 4), plain };
}
async function replyRaw(token, replyToken, messages, fallback) {
  const send = (ms) => fetch('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ replyToken, messages: ms }) });
  let r = await send(messages);
  if (!r.ok && fallback && r.status === 400) { console.error('LINE reply tag', await r.text().catch(() => '')); r = await send(fallback); }
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
          const src = ev.source || {}, id = src.groupId || src.roomId || src.userId || '', grp = !!(src.groupId || src.roomId);
          const k = new URLSearchParams(String((ev.postback || {}).data || '')).get('img');
          if (!IMG_KEYS[k]) continue;
          if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền xem doanh thu.'); continue; }
          const m = ((await imgMeta()) || {})[k];
          if (!m) { await reply(token, ev.replyToken, `Chưa có ảnh ${IMG_KEYS[k]}. Ảnh được tạo mỗi lần lưu số liệu trên dashboard.`); continue; }
          const u = imgUrl(new URL(req.url).origin, k, m.at);
          const img = { type: 'image', originalContentUrl: u, previewImageUrl: u };
          const head = `${IMG_KEYS[k]} · toàn khu vực · số liệu lưu lúc ${fmtVN(m.at)}`;
          // Hủy thủy hải sản / Bán trứng trong nhóm: từ 21h tag quản lý cần nhắc; trước 21h trả ảnh, không tag ai
          const nag = grp && NEED[k] && process.env.LINE_TAG_ALL !== '0' && vnNow().date.getUTCHours() >= NAG_HOUR ? await nagMsgs(k, m, head) : null;
          if (nag) { await replyRaw(token, ev.replyToken, [...nag.tagged, img], nag.plain && [...nag.plain, img]); continue; }
          await reply(token, ev.replyToken, [head, img], grp && !NEED[k]);
          continue;
        }
        if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text' || !ev.replyToken) continue;
        const t = String(ev.message.text || '').trim().toLowerCase().replace(/\s+/g, ' ');
        const src = ev.source || {}, id = src.groupId || src.roomId || src.userId || '', grp = !!(src.groupId || src.roomId);
        if (t === 'dt id') { await reply(token, ev.replyToken, `Mã của nhóm / cuộc trò chuyện này:\n${id}\n\nGửi mã này cho quản trị dashboard để thêm vào LINE_GROUPS.${src.userId ? `\n\nMã LINE của bạn (điền vào cột LINE trong file Base để bot tag tên bạn):\n${src.userId}` : ''}`); continue; }
        // đăng ký / bỏ đăng ký / danh sách đăng ký quản lý (chỉ trong nhóm được cấp quyền)
        const tn = noAcc(t), dk = tn.match(/^dt (dk|dang ky)\s+(.+)$/), huy = /^dt huy( dk| dang ky)?$/.test(tn), ds = /^dt (ds|danh sach)$/.test(tn);
        if (dk || huy || ds) {
          if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền. Gõ "dt id" để lấy mã nhóm rồi gửi quản trị dashboard.'); continue; }
          const doc = await readJSON('data/current.json'), shops = (doc && doc.data && doc.data.shops) || {}, reg = (await readJSON(REG)) || {};
          const lbl = (s) => `${shops[s].qlName ? shops[s].qlName + ' – ' : ''}${shops[s].name || s} (${s})`;
          if (ds) {
            const all = Object.keys(shops), ok = all.filter((s) => isUid((reg[s] || {}).u) || isUid(shops[s].line)), no = all.filter((s) => !ok.includes(s));
            await reply(token, ev.replyToken, `Quản lý đã đăng ký: ${ok.length}/${all.length} siêu thị.${no.length ? `\n\nChưa đăng ký:\n${no.map((s) => '• ' + lbl(s)).join('\n')}\n\nQuản lý gõ: dt dk <mã siêu thị hoặc user QL>` : ''}`);
            continue;
          }
          if (!src.userId) { await reply(token, ev.replyToken, 'Không đọc được tài khoản LINE của bạn. Hãy cập nhật LINE bản mới rồi thử lại.'); continue; }
          if (huy) {
            const mine = Object.keys(reg).filter((s) => reg[s].u === src.userId);
            mine.forEach((s) => delete reg[s]); if (mine.length) await writeJSON(REG, reg);
            await reply(token, ev.replyToken, mine.length ? `Đã bỏ đăng ký: ${mine.map((s) => shops[s] ? lbl(s) : s).join(', ')}.` : 'Bạn chưa đăng ký siêu thị nào.');
            continue;
          }
          const hit = findShops(shops, dk[2]);
          if (!hit.length) { await reply(token, ev.replyToken, 'Không tìm thấy siêu thị. Gõ: dt dk <mã siêu thị> (ví dụ dt dk 6235) hoặc dt dk <user QL>.'); continue; }
          const nm = await lineName(token, src), at = new Date().toISOString();
          hit.forEach((s) => { reg[s] = { u: src.userId, n: nm, at }; });
          await writeJSON(REG, reg);
          await reply(token, ev.replyToken, `✅ Đã ghi nhận ${nm || 'bạn'} quản lý: ${hit.map(lbl).join(', ')}.\nTừ 21h, khi siêu thị hủy thủy hải sản trên 10% hoặc bán trứng 3 ngày liền dưới 100%, bot sẽ tag tên bạn.`);
          continue;
        }
        const isMenu = MENU.test(noAcc(t));
        if (!ASK.test(t) && !isMenu) continue;
        if (!allow.includes(id)) { await reply(token, ev.replyToken, 'Nhóm này chưa được cấp quyền xem doanh thu. Gõ "dt id" để lấy mã nhóm rồi gửi quản trị dashboard.'); continue; }
        if (isMenu) { await reply(token, ev.replyToken, menuMsg(), grp); continue; }
        const doc = await readJSON('data/current.json');
        await reply(token, ev.replyToken, doc && doc.data ? areaReply(doc.data, doc.meta) : 'Dashboard chưa có số liệu.', grp && !!(doc && doc.data));
      } catch (e) { console.error('line event', e); }
    }
    return json({ ok: true });
  },
};
