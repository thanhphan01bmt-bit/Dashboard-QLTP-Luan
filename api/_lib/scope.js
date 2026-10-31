// Giới hạn dữ liệu cho tài khoản "Chỉ xem": chỉ giữ số liệu của siêu thị được gán.
const pick = (o, s) => (o && typeof o === 'object' && s in o ? { [s]: o[s] } : {});

// Siêu thị của tài khoản: gán trong Quản lý tài khoản; chưa gán thì thử khớp tên đăng nhập với mã user QL của siêu thị.
export function shopOf(me, data) {
  if (me.shop) return me.shop === 'all' || (data && data.shops && data.shops[me.shop]) ? me.shop : null;
  const shops = (data && data.shops) || {};
  const hit = Object.keys(shops).find((s) => shops[s] && shops[s].ql && String(shops[s].ql) === me.u);
  return hit || null;
}

const month = (m, s) => {
  if (!m || typeof m !== 'object') return m;
  const out = { ...m };
  for (const k of ['daily', 'cat', 'bills', 'fday']) if (m[k]) out[k] = pick(m[k], s);
  if (m.catLast) out.catLast = { ...m.catLast, s: pick(m.catLast.s, s) };
  return out;
};

export function filterShop(d, s) {
  const out = { ...d, shops: pick(d.shops, s), aug: month(d.aug, s), sep: month(d.sep, s) };
  if (Array.isArray(d.fresh)) out.fresh = d.fresh.filter((r) => r[0] === s);
  if (d.loss) {
    const L = d.loss, nl = { ...L, rows: pick(L.rows, s), daily: pick(L.daily, s) };
    const codes = new Set();
    if (L.pr) { nl.pr = pick(L.pr, s); (nl.pr[s] || []).forEach((a) => codes.add(a[0])); }
    if (L.prd) { nl.prd = { ...L.prd, s: pick(L.prd.s, s) }; ((nl.prd.s || {})[s] || []).forEach((a) => codes.add(a[0])); }
    if (L.prod) { nl.prod = {}; for (const c of codes) if (L.prod[c]) nl.prod[c] = L.prod[c]; }
    if (L.last) nl.last = { ...L.last, rows: pick(L.last.rows, s), pr: L.last.pr ? pick(L.last.pr, s) : null };
    out.loss = nl;
  }
  if (d.ytd && d.ytd.mon) {
    const mon = {};
    for (const m in d.ytd.mon) mon[m] = pick(d.ytd.mon[m], s);
    out.ytd = { ...d.ytd, mon };
    if (d.ytd.dd) { const dd = {}; for (const m in d.ytd.dd) dd[m] = pick(d.ytd.dd[m], s); out.ytd.dd = dd; }
    if (d.ytd.pt) { const pt = {}; for (const m in d.ytd.pt) { pt[m] = {}; for (const k in d.ytd.pt[m]) pt[m][k] = pick(d.ytd.pt[m][k], s); } out.ytd.pt = pt; }
  }
  if (d.catm) { const cm = {}; for (const k in d.catm) cm[k] = { ...d.catm[k], c: pick(d.catm[k].c, s) }; out.catm = cm; }
  if (d.ly && d.ly.mon) {
    const mon = {}, day = {};
    for (const m in d.ly.mon) mon[m] = pick(d.ly.mon[m], s);
    for (const m in d.ly.day || {}) day[m] = pick(d.ly.day[m], s);
    out.ly = { ...d.ly, mon, day };
  }
  return out;
}
