// Tính nội dung thông báo tự động (máy chủ), cùng cách tính với dashboard.
// Mỗi hàm trả về { area, shops: { [mã siêu thị]: tin } }; mỗi tin là { title, body } hoặc null.
const nf = (d) => new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = nf(0), f1 = nf(1);
const tr = (v) => f0.format(Math.round(v / 1e6)) + ' tr';
const pct = (v) => f1.format(v * 100) + '%';
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + f1.format(Math.abs(v * 100)) + '%';
const dimOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const sum = (a) => a.reduce((x, y) => x + (y || 0), 0);

// Giờ Việt Nam
export function vnNow(at = Date.now()) {
  const d = new Date(at + 7 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), hm: d.toISOString().slice(11, 16), date: d };
}
const addDays = (t, n) => vnNow(Date.UTC(t.y, t.m - 1, t.d) - 7 * 3600e3 + 12 * 3600e3 + n * 864e5);
const dm = (t) => `${t.d}/${t.m}`;

function base(data, meta) {
  const D = data;
  const M = D.cur.m, Y = D.cur.y, DIM = dimOf(Y, M), PM = D.prev.m, PDIM = dimOf(D.prev.y, PM), d9 = D.sep.days;
  const g = (+D.goalPct || 0) / 100;
  const SH = Object.keys(D.shops || {});
  const name = (s) => (D.shops[s] && D.shops[s].name) || s;
  // doanh thu 1 ngày; k <= 0 là ngày của tháng trước
  const dl = (s, k) => (k >= 1 ? +((D.sep.daily[s] || {})[k] || 0) : +(((D.aug.daily || {})[s] || {})[PDIM + k] || 0));
  const cum = (s, upto) => { let t = 0; for (let k = 1; k <= upto; k++) t += dl(s, k); return t; };
  const aug = (s) => sum(Object.values((D.aug.daily || {})[s] || {}));
  const goal = (s) => aug(s) * (1 + g);
  const isNew = (s) => Object.keys((D.aug.daily || {})[s] || {}).length < PDIM;
  // giờ lưu số liệu (VN) nếu lưu đúng ngày đổ báo cáo
  let upAt = null;
  if (meta && meta.updatedAt) { const t = vnNow(new Date(meta.updatedAt).getTime()); if (t.y === Y && t.m === M && t.d === d9) upAt = t.hm; }
  return { D, M, Y, DIM, PM, PDIM, d9, g, SH, name, dl, cum, aug, goal, isNew, upAt };
}

// Cảnh báo (giống dashboard): 3 ngày liền < 80% bình quân cần đạt; DT giảm ≥ 20% so cùng thứ tuần trước; hủy tăng đột biến.
export function warnings(B, shops, lastFull) {
  const W = [], { D, dl, goal, DIM, M } = B;
  const L = D.loss && D.loss.daily && D.loss.y === D.cur.y && D.loss.m === D.cur.m ? D.loss : null;
  let ld = 0; if (L) for (const s in L.daily) for (const k in L.daily[s]) ld = Math.max(ld, +k);
  for (const s of shops) {
    const it = [], G = goal(s);
    if (G > 0 && lastFull >= 3) {
      const b = G / DIM, ks = [lastFull - 2, lastFull - 1, lastFull];
      if (ks.every((k) => dl(s, k) / b < 0.8)) it.push({ lv: 2, t: `3 ngày liền dưới 80% mức cần đạt` });
    }
    if (lastFull >= 1) {
      const a = dl(s, lastFull), p = dl(s, lastFull - 7);
      if (a > 0 && p > 0 && a / p - 1 <= -0.2) it.push({ lv: a / p - 1 <= -0.3 ? 2 : 1, t: `DT ${lastFull}/${M} giảm ${f0.format((1 - a / p) * 100)}% so cùng thứ tuần trước` });
    }
    if (L && ld >= 2) {
      const o = L.daily[s] || {};
      const sm = (k) => { let n = 0, h = 0; const x = o[k]; if (x) for (const c in x) { n += x[c][0]; h += x[c][1]; } return [n, h]; };
      const [n1, h1] = sm(ld); let n0 = 0, h0 = 0;
      for (let k = Math.max(1, ld - 7); k < ld; k++) { const [a, b] = sm(k); n0 += a; h0 += b; }
      const r1 = n1 > 0 ? h1 / n1 : 0, r0 = n0 > 0 ? h0 / n0 : 0;
      if (n1 > 0 && r1 >= 0.03 && r1 >= 2 * r0) it.push({ lv: r1 >= 0.06 ? 2 : 1, t: `tỷ lệ hủy ${ld}/${M} là ${pct(r1)}` });
    }
    if (it.length) W.push({ s, it, lv: Math.max(...it.map((x) => x.lv)) });
  }
  return W.sort((a, b) => b.lv - a.lv || b.it.length - a.it.length);
}

// 7h00: hôm nay cần đạt bao nhiêu + siêu thị hụt tiến độ nhiều nhất
export function morning(data, meta, at = Date.now()) {
  const B = base(data, meta), T = vnNow(at), out = { area: null, shops: {} };
  const { SH, name, cum, goal, M, Y, DIM, d9 } = B;
  if (T.y === Y && T.m === M) {
    const upto = Math.min(d9, T.d - 1), left = DIM - T.d + 1;
    const R = SH.map((s) => { const G = goal(s), c = cum(s, upto); return { s, G, c, need: Math.max(0, (G - c) / left), gap: c - G * upto / DIM }; });
    const tot = { need: sum(R.map((r) => r.need)), gap: sum(R.map((r) => r.gap)) };
    const note = upto < T.d - 1 ? ` (số liệu mới đến ${d9}/${M})` : '';
    const behind = R.filter((r) => r.gap < 0).sort((a, b) => a.gap - b.gap);
    const w = behind[0];
    out.area = {
      title: `☀️ Mục tiêu hôm nay ${dm(T)}`,
      body: `Toàn khu vực cần đạt ${tr(tot.need)}${note}.` + (w ? ` Hụt tiến độ nhiều nhất: ${name(w.s)} – thiếu ${tr(-w.gap)}, hôm nay cần ${tr(w.need)}.` : ' Tất cả siêu thị đang đúng tiến độ.') + (behind.length > 1 ? ` ${behind.length} siêu thị đang chậm tiến độ.` : ''),
    };
    for (const r of R) out.shops[r.s] = {
      title: `☀️ ${name(r.s)} · hôm nay ${dm(T)}`,
      body: `Hôm nay cần đạt ${tr(r.need)}${note}. Lũy kế tháng ${M} đang ${r.gap < 0 ? 'thiếu ' + tr(-r.gap) : 'vượt ' + tr(r.gap)} so với tiến độ.`,
    };
    return out;
  }
  // ngày đầu tháng mới, số liệu vẫn là tháng trước: mục tiêu tháng mới = DT tháng vừa qua × (1 + %)
  const nm = M === 12 ? { y: Y + 1, m: 1 } : { y: Y, m: M + 1 };
  if (T.y === nm.y && T.m === nm.m) {
    const ND = dimOf(nm.y, nm.m), left = ND - T.d + 1;
    const R = SH.map((s) => { const done = d9 >= DIM ? cum(s, d9) : cum(s, d9) / d9 * DIM; const G = done * (1 + B.g); return { s, G, need: G / left }; });
    out.area = { title: `☀️ Mục tiêu hôm nay ${dm(T)}`, body: `${T.d === 1 ? `Tháng ${nm.m} bắt đầu` : `Chưa có số liệu tháng ${nm.m}`}: toàn khu vực cần đạt ${tr(sum(R.map((r) => r.need)))}/ngày (mục tiêu tháng ${tr(sum(R.map((r) => r.G)))}).` };
    for (const r of R) out.shops[r.s] = { title: `☀️ ${name(r.s)} · hôm nay ${dm(T)}`, body: `${T.d === 1 ? `Tháng ${nm.m} bắt đầu` : `Chưa có số liệu tháng ${nm.m}`}: hôm nay cần đạt ${tr(r.need)} (mục tiêu tháng ${tr(r.G)}).` };
  }
  return out;
}

// 22h00: tổng kết ngày
export function evening(data, meta, at = Date.now()) {
  const B = base(data, meta), T = vnNow(at), out = { area: null, shops: {} };
  const { SH, name, cum, goal, dl, M, Y, DIM, d9, upAt } = B;
  if (!d9) return out;
  const today = T.y === Y && T.m === M && T.d === d9;
  if (!today) { // chưa ai lưu số liệu hôm nay: chỉ nhắc quản trị / cập nhật dữ liệu, không gửi tổng kết cũ
    out.area = { title: `📊 Chưa có số liệu ngày ${dm(T)}`, body: `Số liệu mới nhất đến ngày ${d9}/${M}. Tải số liệu lên để mọi người nhận tổng kết ngày.` };
    return out;
  }
  const dd = d9, left = DIM - dd + 1;
  const R = SH.map((s) => { const day = dl(s, dd), need = Math.max(0, (goal(s) - cum(s, dd - 1)) / left); return { s, day, need, p: need > 0 ? day / need : (day > 0 ? 9 : 0) }; }).sort((a, b) => b.p - a.p);
  const td = sum(R.map((r) => r.day)), tn = sum(R.map((r) => r.need));
  const lbl = `${dd}/${M}${upAt ? ` (số liệu đến ${upAt})` : ''}`;
  const head = `📊 Tổng kết ngày ${lbl}`;
  const full = upAt && upAt < '21:00' ? dd - 1 : dd;
  const W = warnings(B, SH, full);
  const md = ['🥇', '🥈', '🥉'];
  out.area = {
    title: head,
    body: `DT ${tr(td)} / cần ${tr(tn)} → đạt ${tn > 0 ? pct(td / tn) : '—'}. Top 3: ` + R.slice(0, 3).map((r, i) => `${md[i]} ${name(r.s)} ${pct(r.p)}`).join(' · ') +
      (W.length ? `. ⚠️ ${W.length} cảnh báo: ${W.slice(0, 3).map((w) => name(w.s)).join(', ')}${W.length > 3 ? '…' : ''}` : '. ✅ Không có cảnh báo.'),
  };
  R.forEach((r, i) => {
    const w = W.find((x) => x.s === r.s);
    out.shops[r.s] = {
      title: `📊 ${name(r.s)} · tổng kết ngày ${lbl}`,
      body: `DT ${tr(r.day)} / cần ${tr(r.need)} → đạt ${r.need > 0 ? pct(r.p) : '—'}, hạng ${i + 1}/${R.length} trong ngày.` + (w ? ` ⚠️ ${w.it.map((x) => x.t).join('; ')}.` : ''),
    };
  });
  return out;
}

// Thứ Hai 8h00: tổng kết tuần (thứ Hai → Chủ nhật tuần trước) + thay đổi xếp hạng quản lý
export function weekly(data, meta, rankNow, rankPrev, at = Date.now()) {
  const B = base(data, meta), T = vnNow(at), out = { area: null, shops: {} };
  const { SH, name, D, M, Y, PM, d9 } = B;
  // ngày t -> số thứ tự trong dữ liệu (k <= 0 là tháng trước); null nếu ngoài phạm vi
  const kOf = (t) => (t.y === Y && t.m === M ? (t.d <= d9 ? t.d : null) : (t.m === PM && t.y === D.prev.y ? t.d - B.PDIM : null));
  const week = (from) => { const ks = []; for (let i = 0; i < 7; i++) { const k = kOf(addDays(T, from + i)); if (k != null) ks.push(k); } return ks; };
  const w1 = week(-7), w0 = week(-14);
  if (!w1.length) return out;
  const a = addDays(T, -7), b = addDays(T, -1), partial = w1.length < 7 ? ` (có ${w1.length}/7 ngày số liệu)` : '';
  const dt = (s, ks) => sum(ks.map((k) => B.dl(s, k)));
  const pos = (r) => { const m = {}; ((r && r.rk) || []).forEach((x, i) => { m[x.s] = { i: i + 1, x }; }); return m; };
  const Pn = pos(rankNow), Pp = pos(rankPrev), n = ((rankNow && rankNow.rk) || []).length;
  const ch = Object.keys(Pn).filter((s) => Pp[s]).map((s) => ({ s, d: Pp[s].i - Pn[s].i })).sort((x, y) => y.d - x.d);
  const ql = (s) => (Pn[s] && Pn[s].x.qn) || name(s);
  const T1 = sum(SH.map((s) => dt(s, w1))), T0 = sum(SH.map((s) => dt(s, w0)));
  const top = ((rankNow && rankNow.rk) || []).slice(0, 3);
  let rk = '';
  if (top.length) rk += ` Thi đua QL: 🥇 ${top[0].qn || name(top[0].s)}` + (top[1] ? `, 🥈 ${top[1].qn || name(top[1].s)}` : '') + (top[2] ? `, 🥉 ${top[2].qn || name(top[2].s)}` : '') + '.';
  if (ch.length && ch[0].d > 0) rk += ` Lên hạng nhiều nhất: ${ql(ch[0].s)} (↑${ch[0].d}, hạng ${Pn[ch[0].s].i}).`;
  const dn = ch[ch.length - 1]; if (dn && dn.d < 0) rk += ` Tụt nhiều nhất: ${ql(dn.s)} (↓${-dn.d}, hạng ${Pn[dn.s].i}).`;
  out.area = {
    title: `📅 Tổng kết tuần ${dm(a)}–${dm(b)}`,
    body: `DT toàn khu vực ${tr(T1)}${w0.length === w1.length && T0 > 0 ? ` (${sgn(T1 / T0 - 1)} so tuần trước)` : ''}${partial}.` + rk,
  };
  for (const s of SH) {
    const v1 = dt(s, w1), v0 = dt(s, w0), p = Pn[s], q = Pp[s];
    out.shops[s] = {
      title: `📅 ${name(s)} · tuần ${dm(a)}–${dm(b)}`,
      body: `DT tuần ${tr(v1)}${w0.length === w1.length && v0 > 0 ? ` (${sgn(v1 / v0 - 1)} so tuần trước)` : ''}${partial}.` +
        (p ? ` Thi đua QL: hạng ${p.i}/${n}${q ? (q.i > p.i ? ` (↑${q.i - p.i})` : q.i < p.i ? ` (↓${p.i - q.i})` : ' (giữ hạng)') : ''}, ${f1.format(p.x.tot)} điểm.` : ''),
    };
  }
  return out;
}

// Ngày 1 hàng tháng 8h00: chốt tháng vừa qua + Top 3 thi đua
export function monthly(data, meta, rank, at = Date.now()) {
  const B = base(data, meta), T = vnNow(at), out = { area: null, shops: {} };
  const { SH, name, cum, goal, aug, M, Y, DIM, d9, P = B.PM } = B;
  const pm = T.m === 1 ? { y: T.y - 1, m: 12 } : { y: T.y, m: T.m - 1 };
  if (!(pm.y === Y && pm.m === M)) return out; // số liệu không phải tháng vừa qua
  const note = d9 < DIM ? ` (số liệu đến ${d9}/${M})` : '';
  const tot = { c: sum(SH.map((s) => cum(s, d9))), g: sum(SH.map(goal)), a: sum(SH.map(aug)) };
  const top = ((rank && rank.rk) || []).slice(0, 3), md = ['🥇', '🥈', '🥉'];
  out.area = {
    title: `🏁 Chốt tháng ${M}/${Y}`,
    body: `DT ${tr(tot.c)}${note}, đạt ${tot.g > 0 ? pct(tot.c / tot.g) : '—'} mục tiêu (${tr(tot.g)}), ${tot.a > 0 ? sgn(tot.c / tot.a - 1) : '—'} so T${P}.` +
      (top.length ? ` Top 3 thi đua: ` + top.map((r, i) => `${md[i]} ${r.qn || name(r.s)} (${r.n || name(r.s)}) ${f1.format(r.tot)}đ`).join(' · ') : ''),
  };
  const pos = {}; ((rank && rank.rk) || []).forEach((r, i) => { pos[r.s] = i + 1; });
  const n = ((rank && rank.rk) || []).length;
  for (const s of SH) {
    const c = cum(s, d9), G = goal(s), A = aug(s), r = ((rank && rank.rk) || []).find((x) => x.s === s);
    out.shops[s] = {
      title: `🏁 ${name(s)} · chốt tháng ${M}/${Y}`,
      body: `DT ${tr(c)}${note}, đạt ${G > 0 ? pct(c / G) : '—'} mục tiêu (${tr(G)}), ${A > 0 ? sgn(c / A - 1) : '—'} so T${P}.` + (r ? ` Thi đua QL: hạng ${pos[s]}/${n}, ${f1.format(r.tot)} điểm${pos[s] <= 3 ? ' 🏆' : ''}.` : ''),
    };
  }
  return out;
}

// Thông báo khi vừa lưu số liệu, cho tài khoản chỉ xem 1 siêu thị (không lộ số liệu cả khu vực)
export function shopNotice(data, meta, s) {
  const B = base(data, meta); const { cum, goal, dl, DIM, d9, M, upAt, name } = B;
  if (!data.shops[s] || !d9) return null;
  const need = Math.max(0, (goal(s) - cum(s, d9 - 1)) / (DIM - d9 + 1)), day = dl(s, d9);
  return `${name(s)}: DT ngày ${d9}/${M}${upAt ? ' đến ' + upAt : ''} ${tr(day)} / cần ${tr(need)} → đạt ${need > 0 ? pct(day / need) : '—'}.`;
}
