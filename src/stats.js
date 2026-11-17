// Wrapped stats for the new tab and wrapped.html. ui.js records this PC in yw-stats; other
// devices on the same Yuki ID arrive through sync as yw-stats-<device>. Days are added up.
function statsDays() {
  const out = {};
  const add = s => {
    for (const [k, d] of Object.entries(s?.d || {})) {
      const o = out[k] ||= { t: {}, h: Array(24).fill(0), tabs: 0, pages: 0, srch: 0 };
      for (const [h, v] of Object.entries(d.t || {})) o.t[h] = (o.t[h] || 0) + v;
      (d.h || []).forEach((v, i) => { o.h[i] += v || 0; });
      o.tabs += d.tabs || 0; o.pages += d.pages || 0; o.srch += d.srch || 0;
    }
  };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k === 'yw-stats' || k.startsWith('yw-stats-')) add(JSON.parse(localStorage.getItem(k)));
    }
  } catch {}
  return out;
}
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daySecs = d => Object.values(d?.t || {}).reduce((a, b) => a + b, 0);
function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h ? t('{0}h {1}m', h, m) : t('{0}m', m);
}
// Hosts by time over a set of days, biggest first.
function topSites(days) {
  const m = {};
  for (const d of days) for (const [h, v] of Object.entries(d.t)) m[h] = (m[h] || 0) + v;
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
const favicon = h => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=64`;
