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
    out.loss = nl;
  }
  if (d.ytd && d.ytd.mon) {
    const mon = {};
    for (const m in d.ytd.mon) mon[m] = pick(d.ytd.mon[m], s);
    out.ytd = { ...d.ytd, mon };
  }
  return out;
}
