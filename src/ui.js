// Debug: errors, failed/slow Rust calls and UI stalls go to the server log
// (nginx → /var/log/nginx/yukiweb-debug.log). Remove before a public release.
const LOG = 'https://yuki.yukichat.lol/yukiweb/log';
const sid = Math.random().toString(36).slice(2, 8);
function log(...a) {
  const m = a.map(x => x instanceof Error ? x.stack || x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ').slice(0, 1500);
  new Image().src = `${LOG}?s=${sid}&m=${encodeURIComponent(m)}`;
}
addEventListener('error', e => log('error', e.message, `${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', e => log('reject', String(e.reason)));
log('start', navigator.userAgent, 'dpr', devicePixelRatio, 'tauri', !!window.__TAURI__);
let tick = performance.now();
setInterval(() => { const n = performance.now(); if (n - tick > 600) log('stall', Math.round(n - tick - 250) + 'ms'); tick = n; }, 250);

const invoke = (cmd, args) => {
  const t = performance.now();
  return __TAURI__.core.invoke(cmd, args).then(r => {
    const d = performance.now() - t;
    if (d > 300) log('slow', cmd, Math.round(d) + 'ms');
    return r;
  }, e => { log('fail', cmd, args, String(e)); throw e; });
};
const { listen, emitTo } = __TAURI__.event;
const win = __TAURI__.window.getCurrentWindow();
const $ = s => document.querySelector(s);
const q = $('#q');

// Search engine comes from Settings (shared localStorage).
const ENGINES = { yuki: 'https://search.yukichat.lol/search?q=', google: 'https://www.google.com/search?q=', yandex: 'https://yandex.ru/search/?text=', bing: 'https://www.bing.com/search?q=', ddg: 'https://duckduckgo.com/?q=' };
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} dirty(k); };
const searchUrl = v => (ENGINES[store('yw-search', 'yuki')] || ENGINES.yuki) + encodeURIComponent(v);
const ROUTES = {
  chat: ['Yuki Chat', 'https://yukichat.lol'],
  music: ['YukiMusic', 'https://music.yukichat.lol'],
  mail: ['YukiMail', 'https://mail.yukichat.lol'],
  meet: ['Yuki Meet', 'https://meet.yukichat.lol'],
  wallet: ['Yuki Wallet', 'https://wallet.yukichat.lol'],
  pages: ['Yuki Pages', 'https://pages.yukichat.lol'],
  write: ['Yuki Write', 'https://write.yukichat.lol'],
  board: ['Yuki Board', 'https://board.yukichat.lol'],
  chain: ['YukiChain', 'https://chain.yukichat.lol'],
  hub: ['Yuki Hub', 'https://yuki.yukichat.lol'],
  f1: ['#22 pixel race', '@f1'],
  html: ['HTML playground', 'http://tauri.localhost/html.html'],
};

let settingsOn = false;
let tabs = [], active = null, sugg = [], sel = 0, editing = false, popOn = false;
const T = id => tabs.find(t => t.id === id);
const isNew = u => !u || u.includes('newtab.html');
// A page worth remembering (history, session, reopen): a real website in a normal tab.
const PAGES = 'http://tauri.localhost/';
const real = t => /^https?:/.test(t.url) && !t.url.startsWith(PAGES) && !t.priv;
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const hostOf = u => { try { return new URL(u).host } catch { return '' } };
// Built-in pages (tauri.localhost) match by full address, websites by host.
const routeOf = u => { const h = hostOf(u); return h && Object.keys(ROUTES).find(k => h === 'tauri.localhost' ? ROUTES[k][1] === u : hostOf(ROUTES[k][1]) === h); };

// Title/icon/load events arrive in bursts: draw once per frame, and leave the tab strip
// alone when nothing in it changed (rewriting it re-creates every favicon).
let queued = false, tabsHtml = '';
function render() {
  if (!queued) { queued = true; requestAnimationFrame(draw); }
}
function draw() {
  queued = false;
  saveSession();
  let lastG = null;
  const html = tabs.map(t => {
    const g = t.g && groups.find(x => x.id === t.g);
    const chip = g && g.id !== lastG ? `<div class="grp${g.col ? ' col' : ''}" data-g="${g.id}" style="--gc:${g.c}">${esc(g.name || '')}${g.col ? `<i>${tabs.filter(x => x.g === g.id).length}</i>` : ''}</div>` : '';
    lastG = g ? g.id : null;
    if (g && g.col && t.id !== active) return chip;
    const au = t.audio || t.muted ? `<button class="au${t.muted ? ' m' : ''}" title="${esc(tr(t.muted ? 'Unmute tab' : 'Mute tab'))}">${icon(t.muted ? 'mute' : 'volume')}</button>` : '';
    const sp = split && split.includes(t.id) ? ' sp' : '';
    const fallback = isNew(t.url) ? icon('yuki') : icon(routeOf(t.url) || 'globe');
    const ic = t.loading ? '<i class="ld"></i>' : t.icon && !t.err ? `<img src="${esc(t.icon)}">` : fallback;
    const title = t.title || (isNew(t.url) ? tr('New tab') : hostOf(t.url));
    return chip + `<div class="tab${t.id === active ? ' on' : ''}${t.zz && t.id !== active ? ' zz' : ''}${t.priv ? ' priv' : ''}${g ? ' g' : ''}${sp}"${g ? ` style="--gc:${g.c}"` : ''} data-id="${t.id}" title="${esc(title)}${t.zz ? ' · ' + tr('sleeping') : ''}${t.priv ? ' · ' + tr('private') : ''}">${t.ag ? `<b class="agd" style="background:${esc(t.ag)}" title="${esc(t.agn || '')}"></b>` : ''}${ic}<span>${esc(title)}</span>${au}<button class="x">${icon('x')}</button></div>`;
  }).join('');
  if (html !== tabsHtml) { $('#tabs').innerHTML = tabsHtml = html; $('#tabs .on')?.scrollIntoView({ inline: 'nearest' }); $('#tabs').querySelectorAll('img').forEach(i => i.onerror = () => { i.outerHTML = icon('globe') }); }
  const t = T(active), r = t && !isNew(t.url) && routeOf(t.url);
  if (!editing) q.value = settingsOn ? 'yukiweb://settings' : t && !isNew(t.url) ? t.url.replace(PAGES, 'yukiweb://').replace(/\.html$/, '') : '';
  $('#pill').hidden = !r || editing;
  const page = t && /^https?:/.test(t.url) && !t.err && !settingsOn;
  $('#star').hidden = !page;
  $('#peekbar').hidden = !peek;
  $('#omni').hidden = !!peek;
  if (peek) $('#peekh').textContent = (tr('Peek') + ' · ' + (hostOf(peek.url) || peek.url)).replace(/www\./, '');
  $('#rd').hidden = !(page && real(t));
  $('#ymb').hidden = !(page && musicQuery(t));
  $('#trb').hidden = !(page && t.flang && (t.flang !== LANG || t.trOn));
  $('#trb').classList.toggle('on', !!(page && t.trOn));
  const cws = page && extIdOf(t.url);
  $('#addext').hidden = !cws;
  if (cws) { const have = exts.some(e => e.cws === cws); $('#addext').textContent = extBusy === cws ? 'Adding…' : have ? 'Update in YukiWeb' : 'Add to YukiWeb'; $('#addext').disabled = extBusy === cws; }
  $('#star').classList.toggle('on', !!(page && bmFind(t.url)));
  if (r) $('#pill').textContent = '@' + r;
}

function activate(id, focusUi) {
  if (peek && peek.id !== id) peekClose();
  active = id; editing = false; hidePop(); render();
  settings(false);
  // A restored tab gets its webview only when first opened.
  const t = T(id);
  if (t?.lazy) {
    if (!t.opening) { t.opening = true; invoke('tab_new', { url: t.url, slot: id }); }
    return;
  }
  invoke('tab_activate', { id, focusUi: !!focusUi });
  if (focusUi) q.focus();
  nextPerm();
}

const newTab = url => invoke('tab_new', { url: url || null });

// Ctrl+Shift+T brings these back, newest first.
let closed = [];
function close(id) {
  const i = tabs.findIndex(t => t.id === id);
  if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  if (t.ag) emitTo('agents', 'tab-closed', id);
  if (split && split.includes(id)) setSplit(null);
  if (id === npTab) { npTab = null; setTimeout(npRender, 0); }
  if (real(t)) closed = [...closed.slice(-24), t.url];
  if (!t.lazy) invoke('tab_close', { id });
  if (!tabs.length) return win.close();
  if (id === active) activate(tabs[Math.min(i, tabs.length - 1)].id);
  else render();
}

function resolve(v) {
  const page = v.match(/^yukiweb:\/\/(whatsnew|html|wrapped)\/?$/i);
  if (page) return PAGES + page[1].toLowerCase() + '.html';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  if (/^localhost(:\d+)?(\/|$)/.test(v) || /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(v)) return 'https://' + v;
  return searchUrl(v);
}

// picked = url of a clicked suggestion; otherwise Enter opens the highlighted row only if the user arrowed
// to it (or it's an @/>/% list), else exactly what's in the box.
function go(picked) {
  const v = q.value.trim();
  if (!v && !picked) return;
  if (!picked && /^yukiweb:\/\/settings\/?$/i.test(v)) { editing = false; hidePop(); q.blur(); return settings(true); }
  const top = sugg[0];
  const url = picked || (v.startsWith('@') || (popOn && sel > 0 && sugg[sel]) ? sugg[sel]?.url : /^[>%]/.test(v) ? sugg[sel]?.url || null
    : top?.ic === 'globe' && top.label === v.toLowerCase() ? top.url : resolve(v));
  if (url?.startsWith('cmd:') || url?.startsWith('tab:') || (/^[>%]/.test(v) && !url)) {
    sugg = []; editing = false; hidePop(); q.blur(); render();
    if (url?.startsWith('cmd:')) menuAct(url.slice(4));
    else if (url?.startsWith('tab:')) { const t = T(+url.slice(4)); t ? activate(t.id) : newTab(url.slice(4)); }
    return;
  }
  log('go', hostOf(url) || v.slice(0, 1) + '…', 'active', active, 'tabs', tabs.length);
  sugg = [];
  editing = false; hidePop(); q.blur();
  if (active == null) return newTab(url);
  if (!url) return invoke('tab_error', { id: active, kind: '404', url: v });
  if (url === '@f1') { T(active).url = '@f1'; render(); return invoke('tab_error', { id: active, kind: 'f1', url: '' }); }
  const t = T(active);
  t.url = url; t.err = null; render();
  if (t.lazy) return activate(active);
  invoke('tab_nav', { id: active, url });
  invoke('tab_activate', { id: active, focusUi: false });
}

function suggest(noAuto) {
  const v = q.value.trim().toLowerCase();
  sugg = [];
  if (v.startsWith('@')) {
    const k = v.slice(1);
    sugg = Object.entries(ROUTES)
      .filter(([n, [l]]) => n.startsWith(k) || l.toLowerCase().includes(k))
      .map(([n, [l, u]]) => ({ tag: '@' + n, label: l, hint: u.includes('tauri.localhost') ? 'paste & run' : hostOf(u) || 'mini game', url: u }));
  } else if (v.startsWith('>')) {
    sugg = commands(v.slice(1).trim());
  } else if (v.startsWith('%')) {
    sugg = tabMatches(v.slice(1).trim(), 12);
  } else if (v) {
    // What Enter would open stays first; open-tab matches come right after it.
    const open = tabMatches(v, 2), h = fromHistory(v, noAuto);
    sugg = [h[0], ...open, ...h.slice(1).filter(x => !open.some(o => o.b === bare(x.url || '')))].slice(0, 8);
    webSuggest(q.value.trim());
  }
  sel = 0;
  sugg.length ? showPop() : hidePop();
}

// Search suggestions from Yuki Search, merged in under what Enter would open. Skipped for
// things that look like addresses; a late answer for older text is dropped.
let wsTimer = 0, wsSeq = 0;
const wsCache = new Map();
function webSuggest(text) {
  clearTimeout(wsTimer);
  if (!text || text.length > 120 || /^[a-z][a-z0-9+.-]*:|^[^\s]+\.[a-z]{2,}(\/|$)/i.test(text)) return;
  const my = ++wsSeq;
  const merge = list => {
    if (my !== wsSeq || q.value.trim() !== text || !popOn && !sugg.length) return;
    const have = new Set(sugg.map(s => (s.label || '').toLowerCase()));
    const add = list.filter(s => !have.has(s.toLowerCase())).slice(0, 5)
      .map(s => ({ tag: '', ic: 'search', label: s, hint: '', url: searchUrl(s) }));
    if (!add.length) return;
    sugg = [sugg[0], ...add, ...sugg.slice(1)].filter(Boolean).slice(0, 9);
    showPop();
  };
  if (wsCache.has(text.toLowerCase())) return merge(wsCache.get(text.toLowerCase()));
  wsTimer = setTimeout(async () => {
    try {
      const r = await fetch('https://search.yukichat.lol/api/suggest?q=' + encodeURIComponent(text));
      const list = (await r.json()).filter(s => typeof s === 'string');
      if (wsCache.size > 300) wsCache.clear();
      wsCache.set(text.toLowerCase(), list);
      merge(list);
    } catch { /* offline or blocked: history suggestions are enough */ }
  }, 120);
}

function showPop() {
  const r = $('#omni').getBoundingClientRect();
  emitTo('pop', 'items', { items: sugg, sel });
  invoke('pop_show', { x: r.left, w: r.width, h: sugg.length * 40 + 12 });
  popOn = true;
}

function hidePop() {
  if (popOn) invoke('pop_hide');
  popOn = false;
}

function reload() {
  const t = T(active);
  if (!t) return;
  if (t.url === '@f1') return invoke('tab_error', { id: t.id, kind: 'f1', url: '' });
  if (t.err && t.url) invoke('tab_nav', { id: t.id, url: t.url });
  else invoke('tab_cmd', { id: t.id, cmd: 'reload' });
}

// Yuki DevTools (src/dev.html, src-tauri/src/dev.rs): F12 toggles, Ctrl+Shift+C picks an element,
// Ctrl+Shift+J opens the console, Ctrl+Shift+I opens it; Chromium's own window is a button in the panel.
let devOn = false;
listen('dev-open', ({ payload }) => { devOn = payload; });
async function dev(k) {
  if (k === 'dev-native') return invoke('dev_native', { id: active }).catch(() => {});
  if (k === 'dev-pick') return invoke('dev_go', { what: 'pick' }).catch(() => {});
  if (k === 'dev-console') return invoke('dev_go', { what: 'con' }).catch(() => {});
  await invoke('dev_open', { open: k === 'dev' ? !devOn : true }).catch(() => {});
}
function key(k) {
  const i = tabs.findIndex(t => t.id === active);
  if (k.startsWith('dev')) dev(k);
  else if (k === 't') newTab();
  else if (k === 'w') close(active);
  else if (k === 'l') { invoke('ui_focus'); q.focus(); q.select(); }
  else if (k === 'next' && tabs.length) activate(tabs[(i + 1) % tabs.length].id);
  else if (k === 'prev' && tabs.length) activate(tabs[(i - 1 + tabs.length) % tabs.length].id);
  else if (k === 'reload') reload();
  else if (k === 'j') showDl();
  else if (k === 'reopen' && closed.length) newTab(closed.pop());
  else if (k === 'bm') toggleBm();
  else if (k === 'private') invoke('tab_new', { url: null, private: true });
  else if (k === 'bmbar') showBar(!store('yw-bmbar', false));
  else if (k === 'find') showFind();
  else if (k === 'palette') palette('>');
  else if (k === 'tabsearch') palette('%');
  else if (k === 'tasks') menuAct('tasks');
  else if (k === 'peek-esc') peekClose();
}

listen('tab-opened', ({ payload: [id, url, bg, slot, priv] }) => {
  log('tab-opened', id);
  const p = slot != null && T(slot);
  if (slot != null && !p) return invoke('tab_close', { id }); // closed while it was opening
  if (p) {
    Object.assign(p, { id, lazy: false, opening: false, zz: false });
    if (active === slot) active = id;
    return activate(active);
  }
  if (!priv) bump('tabs');
  if (peekWant && bg) { peekWant = false; peek = { id, url }; invoke('tab_peek', { id }); return render(); }
  const i = tabs.findIndex(t => t.id === active);
  tabs.splice(i + 1, 0, { id, url, title: '', priv, g: groupNext ?? undefined });
  groupNext = null;
  bg ? render() : activate(id, !url);
});
listen('tab', ({ payload: { id, url, loading } }) => {
  if (peek && peek.id === id) { peek.url = url; return render(); }
  const t = T(id);
  if (!t) return;
  t.loading = loading;
  // Error pages load as about:blank; keep showing the URL that failed.
  if (!/^(about|data):/.test(url)) {
    if (t.url !== url) { t.err = null; if (loading) t.icon = ''; }
    t.url = url;
    if (isNew(url)) t.title = '';
  }
  if (!loading && !t.err && real(t)) visit(t.url, t.title);
  render();
});
// In-page navigation (pushState/hash): only the address changes, there is no page load.
listen('tab-url', ({ payload: [id, url] }) => {
  if (peek && peek.id === id) { peek.url = url; return render(); }
  const t = T(id);
  if (!t || t.url === url || /^(about|data):/.test(url)) return;
  t.url = url;
  if (!t.loading && !t.err && real(t)) visit(t.url, t.title);
  render();
});
listen('tab-sleep', ({ payload: [id, zz] }) => { const t = T(id); if (t && t.zz !== zz) { t.zz = zz; render(); } });
listen('tab-title', ({ payload: [id, title] }) => { const t = T(id); if (t) { t.title = title; retitle(t.url, title); render(); if (id === npTab) npRender(); } });
listen('tab-icon', ({ payload: [id, icon] }) => { const t = T(id); if (t) { t.icon = icon; render(); } });
listen('tab-err', ({ payload: [id, kind, url] }) => { const t = T(id); if (t) { t.err = kind; t.url = url; t.icon = ''; render(); } });
listen('update', ({ payload }) => { const b = $('#upd'); b.hidden = false; b.title = 'YukiWeb ' + payload; });
listen('rlog', ({ payload }) => log('rust', payload));
listen('key', ({ payload }) => key(payload));
listen('pick', ({ payload }) => go(payload));

$('#tabs').addEventListener('mousedown', e => {
  const el = e.target.closest('.tab');
  if (!el || e.button !== 0 || e.target.closest('.x,.au')) return;
  activate(+el.dataset.id);
  drag = { id: +el.dataset.id, x: e.clientX, on: false };
});
// Drag tabs to reorder: the dragged tab swaps places once the pointer passes a neighbour's middle.
let drag = null;
document.addEventListener('mousemove', e => {
  if (!drag) return;
  if (!(e.buttons & 1)) { drag = null; return; }
  if (!drag.on && Math.abs(e.clientX - drag.x) < 6) return;
  drag.on = true;
  const i = tabs.findIndex(t => t.id === drag.id);
  const els = [...$('#tabs').querySelectorAll('.tab')];
  const over = els.find(el => { const r = el.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
  let j = over ? tabs.findIndex(t => t.id === +over.dataset.id) : tabs.length - 1;
  j = j > i && over ? j - 1 : j;
  if (i >= 0 && j !== i) {
    const [t] = tabs.splice(i, 1);
    tabs.splice(j, 0, t);
    // Dropped between two tabs of a group: it joins; dragged out of its group: it leaves.
    const a = tabs[j - 1]?.g, b = tabs[j + 1]?.g;
    t.g = a && a === b ? a : t.g && (a === t.g || b === t.g) ? t.g : undefined;
    render();
  }
});
document.addEventListener('mouseup', () => { drag = null; });
$('#tabs').addEventListener('click', e => {
  if (e.target.closest('.x')) return close(+e.target.closest('.tab').dataset.id);
  const au = e.target.closest('.au');
  if (au) { const t = T(+au.closest('.tab').dataset.id); if (t) invoke('tab_mute', { id: t.id, on: !t.muted }); return; }
  const chip = e.target.closest('.grp');
  if (chip) { const g = groups.find(x => x.id === +chip.dataset.g); if (g) { g.col = !g.col; saveSession(); render(); } }
});
$('#tabs').addEventListener('contextmenu', e => {
  e.preventDefault();
  const el = e.target.closest('.tab'), chip = e.target.closest('.grp');
  if (el) tabMenu(+el.dataset.id, e.clientX);
  else if (chip) groupMenu(+chip.dataset.g, e.clientX);
});
// Past the point where tabs are favicon-only, the strip scrolls with the wheel.
$('#tabs').addEventListener('wheel', e => { $('#tabs').scrollLeft += e.deltaY || e.deltaX; }, { passive: true });
$('#tabs').addEventListener('auxclick', e => { const el = e.target.closest('.tab'); if (el && e.button === 1) close(+el.dataset.id); });

q.addEventListener('focus', () => { editing = true; $('#pill').hidden = true; q.select(); });
q.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== q) { editing = false; hidePop(); render(); } }, 150));
q.addEventListener('input', e => {
  const d = performance.now() - e.timeStamp;
  if (d > 150) log('input-lag', Math.round(d) + 'ms');
  const del = e.inputType?.startsWith('delete');
  suggest(del);
  if (!del) complete();
});
q.addEventListener('keydown', e => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugg.length) {
    sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + sugg.length) % sugg.length;
    showPop(); e.preventDefault();
  } else if (e.key === 'Enter') go();
  else if (e.key === 'Escape') { editing = false; hidePop(); draw(); q.select(); editing = true; }
});

document.addEventListener('keydown', e => {
  const k = e.shiftKey && e.key === 'Escape' ? 'tasks' : e.ctrlKey && { f: 'find', k: 'palette', A: 'tabsearch', N: 'private', d: 'bm', B: 'bmbar', t: 't', T: 'reopen', w: 'w', l: 'l', j: 'j', r: 'reload', Tab: e.shiftKey ? 'prev' : 'next' }[e.key] || (e.key === 'F5' && 'reload') || (e.key === 'F12' && 'dev');
  if (k) { e.preventDefault(); key(k); }
});

$('#add').onclick = () => newTab();
$('#back').onclick = () => invoke('tab_cmd', { id: active, cmd: 'back' });
$('#fwd').onclick = () => invoke('tab_cmd', { id: active, cmd: 'forward' });
$('#rel').onclick = reload;
$('#upd').onclick = () => invoke('update_install');
let panelClosed = 0;
$('#vpn').onclick = () => {
  if (Date.now() - panelClosed < 400) return;
  hidePop();
  const t = T(active);
  emitTo('panel', 'site', t && !isNew(t.url) && !t.err ? hostOf(t.url) : '');
  invoke('panel_show', { right: $('#vpn').getBoundingClientRect().right + 8, view: 'vpn', height: 640 });
};
listen('panel-closed', () => { panelClosed = Date.now(); });
function vpnState({ on, name, err }) {
  $('#vpn').classList.toggle('on', on);
  $('#vpn').classList.toggle('err', !!err);
  $('#vpn').title = err ? 'VPN error: ' + err : on ? 'VPN on · ' + name : 'VPN off';
}
listen('vpn', ({ payload }) => vpnState(payload));
invoke('vpn_get').then(([v, err]) => vpnState({ on: v.on && !err, name: v.servers[v.sel]?.name || '', err })).catch(() => { $('#vpn').hidden = true; });
// --- Yuki ID: sign in through YukiChat SSO; Rust catches the redirect and sends the code here ---
const API = 'https://vps.yukichat.lol:8443';
// Through the local proxy: the direct network may not reach our server (same as the updater).
let proxyPort = null;
invoke('proxy_port').then(p => { proxyPort = p; }, () => {});
const viaProxy = () => proxyPort ? { proxy: { all: 'http://127.0.0.1:' + proxyPort } } : {};
const http = async (path, opt = {}) => {
  if (!proxyPort) proxyPort = await invoke('proxy_port').catch(() => null);
  return __TAURI__.http.fetch(API + path, { ...opt, ...viaProxy() });
};
let acct = null, ssoState = '';
try { acct = JSON.parse(localStorage.getItem('yw-acct') || 'null'); } catch {}
function saveAcct(a) {
  // A new sign-in starts sync from scratch (merging this PC with the account); signing out stops it.
  if (a?.token !== acct?.token) { syncMeta = { at: {}, since: 0, first: true }; keep('yw-sync', syncMeta); if (a) setTimeout(syncNow, 500); }
  acct = a;
  try { a ? localStorage.setItem('yw-acct', JSON.stringify(a)) : localStorage.removeItem('yw-acct'); } catch {}
  if (!a) try { localStorage.removeItem('yw-dash-data'); } catch {}
  renderAcct();
  invoke('set_signed_in', { on: !!a });
}
function renderAcct() {
  const p = acct?.profile, b = $('#acct'), name = p?.display_name || p?.username || '';
  b.innerHTML = !p ? icon('user') : p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span class="ini">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  b.title = p ? `Yuki ID · ${name}` : 'Sign in to Yuki ID';
  if (p && badge) b.insertAdjacentHTML('beforeend', `<b class="bd">${badge > 99 ? '99+' : badge}</b>`);
  const img = b.querySelector('img');
  if (img) img.onerror = () => { img.outerHTML = `<span class="ini">${esc(name.slice(0, 1).toUpperCase())}</span>`; };
}
const showAcct = () => { invoke('panel_show', { right: $('#acct').getBoundingClientRect().right + 8, view: 'acct', height: Math.min(600, 300 + notif.length * 52) }); setTimeout(notifSend, 60); };
$('#acct').onclick = () => {
  if (Date.now() - panelClosed < 400) return;
  hidePop();
  if (acct) return showAcct();
  ssoState = crypto.randomUUID();
  newTab('https://yukichat.lol/?sso=web&state=' + ssoState);
};
listen('signin', async ({ payload: [id, url] }) => {
  const u = new URL(url), code = u.searchParams.get('yc_code');
  // Land the tab on Yuki Chat, which this sign-in just logged in.
  invoke('tab_nav', { id, url: ROUTES.chat[1] });
  if (!code || !ssoState || u.searchParams.get('state') !== ssoState) return log('signin: bad state');
  ssoState = '';
  try {
    const r = await http('/api/yukiweb/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    if (!r.ok) throw new Error('login ' + r.status);
    saveAcct(await r.json());
    showAcct();
  } catch (e) { log('signin failed', String(e)); }
});
listen('open', ({ payload }) => newTab(payload));
listen('signout', () => {
  if (acct?.token) http('/api/yukiweb/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + acct.token } }).catch(() => {});
  saveAcct(null);
});
renderAcct();
if (acct?.token) {
  http('/api/yukiweb/profile', { headers: { Authorization: 'Bearer ' + acct.token } })
    .then(async r => { if (r.ok) saveAcct({ ...acct, profile: await r.json() }); else if (r.status === 401) saveAcct(null); })
    .catch(() => {});
}

$('#chat').onclick = () => { keep('yw-chat-used', true); invoke('chat_toggle').then(on => $('#chat').classList.toggle('on', on)); };
// Chat is slow to create: people who use it get it made hidden shortly after startup.
if (store('yw-chat-used', false)) setTimeout(() => invoke('chat_prewarm').catch(() => {}), 8000);
$('#min').onclick = () => win.minimize();
$('#max').onclick = () => win.toggleMaximize();
$('#cls').onclick = () => win.close();


// --- History: every finished page load, for address-bar suggestions ---
// [{u, t, n (visits), at (ms)}], newest first, capped. Settings → Clear data wipes it.
let hist = store('yw-hist', []), histSave = 0;
const bare = u => u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
function saveHist() { clearTimeout(histSave); histSave = setTimeout(() => keep('yw-hist', hist.slice(0, 3000)), 1000); }
function visit(u, title) {
  if (!/^https?:/.test(u) || u.startsWith(PAGES) || u.startsWith(ROUTES.chat[1] + '/?sso')) return;
  const i = hist.findIndex(h => h.u === u);
  const h = i >= 0 ? hist.splice(i, 1)[0] : { u, t: '', n: 0 };
  if (Date.now() - (h.at || 0) > 30000) { h.n++; bump('pages'); if (SEARCH_RE.test(u)) bump('srch'); }
  h.at = Date.now(); if (title) h.t = title;
  hist.unshift(h); saveHist();
}
function retitle(u, title) { const h = hist.find(h => h.u === u); if (h && title) { h.t = title; saveHist(); } }
// Frequent and recent pages first; a visit a week ago counts about half.
const score = h => h.n / (1 + (Date.now() - h.at) / 6048e5);

// Best inline completion for what's typed: a site name first ("dash" → "dash.cloudflare.com"), then a full address.
function completion(v) {
  let best = null;
  for (const h of hist) {
    const b = bare(h.u), host = b.split('/')[0];
    const c = host.startsWith(v) ? host : b.startsWith(v) ? b : null;
    if (c && (!best || score(h) > best.s || (c === host && best.c !== bare(best.u).split('/')[0]))) best = { c, u: c === host ? 'https://' + hostOf(h.u) : h.u, s: score(h) };
  }
  return best;
}
// noAuto: the inline completion was just deleted, so the typed text (not the completion) goes first.
function fromHistory(v, noAuto) {
  const out = [], seen = new Set(), c = completion(v);
  const ci = c && { tag: '', ic: 'globe', label: c.c, hint: '', url: c.u };
  if (ci && !noAuto) { out.push(ci); seen.add(bare(c.u)); }
  const r = resolve(v), isUrl = !r.startsWith(searchUrl(''));
  if (!(isUrl && seen.has(bare(r)))) { out.push(isUrl ? { tag: '', ic: 'globe', label: v, hint: '', url: r } : { tag: '', ic: 'search', label: v, hint: { yuki: 'Yuki Search', google: 'Google', yandex: 'Yandex', bing: 'Bing', ddg: 'DuckDuckGo' }[store('yw-search', 'yuki')] || 'Yuki Search', url: r }); seen.add(bare(r)); }
  if (ci && noAuto && !seen.has(bare(c.u))) { out.push(ci); seen.add(bare(c.u)); }
  for (const b of bmFlat().filter(b => bare(b.u).includes(v) || b.t.toLowerCase().includes(v))) {
    if (out.length >= 4) break;
    if (seen.has(bare(b.u))) continue;
    seen.add(bare(b.u));
    out.push({ tag: '', ic: 'star', label: b.t || bare(b.u), hint: bare(b.u), url: b.u });
  }
  const m = hist.filter(h => bare(h.u).includes(v) || h.t.toLowerCase().includes(v)).sort((a, b) => score(b) - score(a));
  for (const h of m) {
    if (out.length >= 7) break;
    if (seen.has(bare(h.u))) continue;
    seen.add(bare(h.u));
    out.push({ tag: '', ic: 'globe', label: h.t || bare(h.u), hint: bare(h.u), url: h.u });
  }
  return out;
}
// Chrome-style: fill in the rest of the best match and select it, so typing on replaces it.
function complete() {
  const v = q.value, c = v && !v.startsWith('@') && !/\s/.test(v) && completion(v.toLowerCase());
  if (!c || c.c.length <= v.length) return;
  q.value = v + c.c.slice(v.length);
  q.setSelectionRange(v.length, q.value.length);
}

// --- Panels: 3-dot menu, downloads, permission popups (all views of panel.html) ---
const panelAt = (btn, view, height) => {
  if (Date.now() - panelClosed < 400) return false;
  hidePop();
  invoke('panel_show', { right: $(btn).getBoundingClientRect().right + 8, view, height });
  return true;
};
$('#menu').innerHTML = icon('dots');
$('#dl').innerHTML = icon('download');
$('#menu').onclick = () => {
  const t = T(active);
  emitTo('panel', 'zoom', t?.zoom || 100);
  panelAt('#menu', 'menu', 500);
};
listen('menu', ({ payload: [act, arg] }) => menuAct(act, arg));
function menuAct(act, arg) {
  const t = T(active);
  if (act === 'new') newTab();
  else if (act === 'dl') showDl();
  else if (act === 'reload') reload();
  else if (act === 'settings') { settings(true); if (arg) emitTo('settings', 'settings-go', arg); }
  else if (act === 'private') invoke('tab_new', { url: null, private: true });
  else if (act === 'whatsnew') { settings(false); newTab(PAGES + 'whatsnew.html'); }
  else if (act === 'wrapped') { settings(false); newTab(PAGES + 'wrapped.html'); }
  else if (act === 'find') setTimeout(showFind, 50);
  else if (act === 'reader') reader();
  else if (act === 'translate') setTimeout(trPanel, 50);
  else if (act === 'notes') setTimeout(notesShow, 50);
  else if (act === 'shot' && t) setTimeout(() => panelAt('#menu', 'shot', 470), 50);
  else if (act === 'qr' && t && !isNew(t.url)) setTimeout(() => { if (panelAt('#menu', 'qr', 380)) setTimeout(() => emitTo('panel', 'qr', t.url), 80); }, 50);
  else if (act === 'pip' && t) ev(t.id, '__yukiweb.pip()');
  else if (act === 'bmbar') showBar(!store('yw-bmbar', false));
  else if (act === 'print' && t) invoke('tab_cmd', { id: t.id, cmd: 'print' });
  else if (act === 'zoom' && t) invoke('tab_zoom', { id: t.id, step: arg }).then(z => { t.zoom = z; emitTo('panel', 'zoom', z); });
  else if (act === 'reopen' && closed.length) newTab(closed.pop());
  else if (act === 'bm') toggleBm();
  else if (act === 'dev') dev('dev');
  else if (act === 'tasks') setTimeout(tasksShow, 50);
  else if (act === 'split' && t) { const i = tabs.indexOf(t), o = tabs[i + 1] || tabs[i - 1]; if (o && !o.lazy) setSplit([t.id, o.id]); }
  else if (act === 'unsplit') setSplit(null);
  else if (act === 'mute' && t) invoke('tab_mute', { id: t.id, on: !t.muted });
  else if (act === 'dup' && t && !isNew(t.url)) newTab(t.url);
  else if (act === 'close' && t) close(t.id);
  else if (act === 'vpn') invoke('vpn_get').then(([v]) => invoke('vpn_set', { v: { ...v, on: !v.on } })).catch(e => log('vpn', String(e)));
  else if (act === 'html') newTab(ROUTES.html[1]);
  else if ((act === 'zin' || act === 'zout') && t) menuAct('zoom', act === 'zin' ? 1 : -1);
  else if (act === 'tabsearch') palette('%');
  else if (act === 'send' && t) sendTab(t);
}

let dls = [];
function showDl() { panelAt('#dl', 'dl', 420); }
function dlState() {
  const b = $('#dl'), run = dls.filter(d => d.state === 'run');
  b.hidden = !dls.length;
  b.classList.toggle('run', !!run.length);
  const tot = run.reduce((a, d) => a + d.total, 0), got = run.reduce((a, d) => a + d.got, 0);
  b.style.setProperty('--p', tot > 0 ? got / tot : .1);
  b.title = run.length ? `Downloading ${run.length} file${run.length > 1 ? 's' : ''}…` : 'Downloads (Ctrl+J)';
}
$('#dl').onclick = showDl;
listen('dl', ({ payload: d }) => {
  const i = dls.findIndex(x => x.id === d.id), fresh = i < 0, was = dls[i]?.state;
  fresh ? dls.unshift(d) : dls[i] = d;
  dlState();
  if (fresh || (was === 'run' && d.state === 'done')) {
    const b = $('#dl'); b.classList.remove('new'); void b.offsetWidth; b.classList.add('new');
  }
});
listen('dl-list', ({ payload }) => { dls = payload; dlState(); });
invoke('dl_list').then(l => { dls = l; dlState(); });

// Permission requests wait in a queue; a background tab's request shows when you switch to it.
let perms = [], permOn = null;
function nextPerm() {
  if (permOn) return;
  const a = perms.find(p => p.tab === active || p.tab === 0);
  if (!a) return;
  permOn = a;
  emitTo('panel', 'perm-ask', a);
  const r = $('#omni').getBoundingClientRect();
  invoke('panel_show', { right: r.left + 340, view: 'perm', height: 190 });
}
listen('perm', ({ payload }) => { perms.push(payload); nextPerm(); });
listen('perm-done', ({ payload: id }) => {
  perms = perms.filter(p => p.id !== id);
  permOn = null;
  setTimeout(nextPerm, 150);
});

// --- Settings: its own webview over the page area ---
function settings(on) {
  if (on === settingsOn) return;
  settingsOn = on;
  invoke('settings_show', { open: on });
  if (on) { hidePop(); q.value = 'yukiweb://settings'; } else render();
}
listen('settings-close', () => settings(false));
listen('hist-cleared', () => { hist = []; });
invoke('set_sleep', { secs: store('yw-sleep', 300) });

// --- Bookmarks: [{u, t, i}] or folders {t, c: [...]} (from imports), in yw-bm ---
let bms = store('yw-bm', []);
const bmFlat = () => bms.flatMap(b => b.c ? b.c : [b]);
const bmFind = u => bmFlat().find(b => b.u === u);
function bmSave() { keep('yw-bm', bms); bmBar(); render(); }
function toggleBm() {
  const t = T(active);
  if (!t || !/^https?:/.test(t.url) || t.err) return;
  if (bmFind(t.url)) bmRemove(t.url);
  else { bms.push({ u: t.url, t: t.title || hostOf(t.url), i: t.icon || '' }); bmSave(); }
}
function bmRemove(u) {
  bms = bms.map(b => b.c ? { ...b, c: b.c.filter(x => x.u !== u) } : b).filter(b => b.c ? b.c.length : b.u !== u);
  bmSave();
}
function bmBar() {
  $('#bms').innerHTML = bms.map((b, i) => `<button data-i="${i}" title="${esc(b.c ? b.t : b.t + '\n' + b.u)}">${b.c ? icon('folder') : b.i ? `<img src="${esc(b.i)}">` : icon('globe')}<span>${esc(b.t || hostOf(b.u))}</span></button>`).join('');
  $('#bms').querySelectorAll('img').forEach(i => i.onerror = () => { i.outerHTML = icon('globe') });
}
function showBar(on) {
  if (store('yw-bmbar', false) !== on) keep('yw-bmbar', on);
  $('#bmbar').hidden = !on;
  document.body.classList.toggle('bm', on);
  invoke('set_top', { px: on ? 114 : 84 });
}
// Bookmarks open in the current tab; middle-click opens a background tab.
function openBm(u, bg) {
  if (bg) return invoke('tab_new', { url: u, bg: true });
  const t = T(active);
  if (!t) return newTab(u);
  q.value = u; go();
}
function bmPanel(title, list) {
  emitTo('panel', 'bm-show', { title, items: list });
  panelAt('#bmmore', 'bm', Math.min(520, 70 + list.length * 40));
}
$('#bms').addEventListener('mouseup', e => {
  const b = e.target.closest('button'), x = b && bms[+b.dataset.i];
  if (!x || (e.button !== 0 && e.button !== 1)) return;
  if (x.c) return bmPanel(x.t, x.c);
  openBm(x.u, e.button === 1);
});
$('#bmmore').innerHTML = icon('chevrons');
$('#bmmore').onclick = () => bmPanel('Bookmarks', bmFlat());
$('#star').innerHTML = icon('star');
$('#rd').innerHTML = icon('book');
$('#trb').innerHTML = icon('languages');
$('#rd').onmousedown = $('#trb').onmousedown = e => e.preventDefault();
$('#rd').onclick = reader;
$('#ymb').innerHTML = icon('music');
$('#ymb').onmousedown = e => e.preventDefault();
$('#ymb').onclick = () => { const q = musicQuery(T(active)); if (q) newTab('https://music.yukichat.lol/search?q=' + encodeURIComponent(q)); };
$('#trb').onclick = trPanel;
$('#star').onmousedown = e => e.preventDefault();
$('#star').onclick = toggleBm;
listen('bm-open', ({ payload: [u, bg] }) => openBm(u, bg));
listen('bm-remove', ({ payload: u }) => bmRemove(u));
// Settings imports and edits write yw-bm directly.
addEventListener('storage', e => {
  if (e.key === 'yw-bm') { bms = store('yw-bm', []); bmBar(); render(); }
  if (e.key === 'yw-bmbar') showBar(store('yw-bmbar', false));
});
bmBar();
if (store('yw-bmbar', false)) showBar(true);

// --- Extensions: installed from Chrome Web Store pages; WebView2 runs them, we draw the toolbar part ---
let exts = [], extBusy = '';
const extIdOf = u => (u.match(/^https:\/\/chromewebstore\.google\.com\/detail\/(?:[^/]+\/)?([a-p]{32})/) || [])[1];
function extState() { $('#ext').hidden = !exts.length; render(); }
async function extInstall(id) {
  if (extBusy) return;
  extBusy = id; render();
  try {
    const ver = (navigator.userAgent.match(/Chrome\/([\d.]+)/) || [])[1] || '130.0';
    const r = await __TAURI__.http.fetch(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${ver}&acceptformat=crx2,crx3&x=id%3D${id}%26uc`);
    if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    const e = await __TAURI__.core.invoke('ext_install', new Uint8Array(await r.arrayBuffer()), { headers: { 'x-cws': id } });
    emitTo('settings', 'ext-msg', 'Added ' + e.name);
  } catch (e) {
    log('ext install', String(e));
    emitTo('settings', 'ext-msg', 'Error: ' + String(e));
    alert(tr("Couldn't add the extension: ") + e);
  }
  extBusy = ''; render();
}
$('#addext').onclick = () => { const t = T(active); const id = t && extIdOf(t.url); if (id) extInstall(id); };
$('#ext').innerHTML = icon('puzzle');
$('#ext').onclick = () => { emitTo('panel', 'ext-list', exts); panelAt('#ext', 'ext', Math.min(460, 70 + exts.length * 44)); };
listen('ext', ({ payload }) => { exts = payload; extState(); });
listen('ext-install', ({ payload }) => extInstall(payload));
// Extension without a popup: open its options page, or nothing to show.
listen('ext-open', ({ payload: e }) => {
  if (e.popup) invoke('ext_popup', { id: e.id, right: $('#ext').getBoundingClientRect().right + 8 });
  else if (e.options) newTab(`chrome-extension://${e.id}/${e.options}`);
});
invoke('ext_list').then(l => { exts = l; extState(); });

// --- Yuki ID sync: bookmarks, appearance, settings and history follow the account ---
// Each synced key keeps its last change time (syncMeta.at); newer wins. History and the first
// sync's bookmarks are merged instead, so nothing on either side is lost.
// `var`: keep() can run (and call dirty) before this part of the file has loaded.
// Wrapped stats sync as stats_<this device>; other devices' land in yw-stats-<device> (wrapped.html adds them up).
var DEV = store('yw-dev', null) || (() => { const d = Math.random().toString(36).slice(2, 10).padEnd(8, '0'); try { localStorage.setItem('yw-dev', JSON.stringify(d)); } catch {} return d; })();
var SYNC = { bm: 'yw-bm', bmbar: 'yw-bmbar', theme: 'yw-theme', wall: 'yw-wall', search: 'yw-search', sleep: 'yw-sleep', hist: 'yw-hist', lang: 'yw-lang', dash: 'yw-dash', hl: 'yw-hl', trauto: 'yw-trauto', moo: 'yw-moo', ['stats_' + DEV]: 'yw-stats' };
var GROUP = { bm: 'bm', bmbar: 'bm', theme: 'look', wall: 'look', search: 'set', sleep: 'set', hist: 'hist', lang: 'set', dash: 'look', hl: 'bm', trauto: 'set', moo: 'look', ['stats_' + DEV]: 'hist' };
var SYNC_STATS = 'stats_' + DEV;
var LOCAL = Object.fromEntries(Object.entries(SYNC).map(([k, v]) => [v, k]));
var syncMeta = store('yw-sync', { at: {}, since: 0, first: true }), syncT = 0, syncBusy = false;
const syncOn = k => ({ bm: true, look: true, set: true, hist: true, ...store('yw-sync-on', {}) })[GROUP[k]];
function dirty(localKey) {
  const k = LOCAL && LOCAL[localKey];
  if (!k || !acct?.token) return;
  syncMeta.at[k] = Date.now();
  syncMeta.dirty = { ...syncMeta.dirty, [k]: 1 };
  try { localStorage.setItem('yw-sync', JSON.stringify(syncMeta)); } catch {}
  clearTimeout(syncT);
  syncT = setTimeout(syncNow, k === 'hist' ? 60000 : 4000);
}
// Settings, the panel and the new tab page write these keys from their own documents.
addEventListener('storage', e => { if (e.key && LOCAL[e.key]) dirty(e.key); });
function syncStatus(text) {
  try { localStorage.setItem('yw-sync-status', text); } catch {}
  emitTo('settings', 'sync-status', text);
}
const raw = k => { try { return localStorage.getItem(SYNC[k]) ?? '' } catch { return '' } };
const parse = v => { try { return JSON.parse(v) } catch { return null } };
function mergeHist(a, b) {
  const m = new Map();
  for (const h of [...(a || []), ...(b || [])]) {
    const o = m.get(h.u);
    m.set(h.u, o ? { ...o, n: Math.max(o.n, h.n), at: Math.max(o.at, h.at), t: (h.at > o.at ? h.t : o.t) || o.t || h.t } : h);
  }
  return [...m.values()].sort((x, y) => y.at - x.at).slice(0, 3000);
}
// Notes: union per page; the same passage keeps whichever copy was changed last.
function mergeHl(a, b) {
  const out = { ...(a || {}) };
  for (const [u, list] of Object.entries(b || {})) {
    const m = new Map((out[u] || []).map(n => [n.text, n]));
    for (const n of list) { const o = m.get(n.text); if (!o || (n.at || 0) > (o.at || 0)) m.set(n.text, n); }
    out[u] = [...m.values()];
  }
  return out;
}
function mergeBm(a, b) {
  const out = [...(a || [])], have = new Set(out.flatMap(x => x.c ? x.c : [x]).map(x => x.u));
  for (const x of b || []) {
    if (x.c) { const c = x.c.filter(y => !have.has(y.u)); if (c.length) out.push({ ...x, c }); }
    else if (!have.has(x.u)) out.push(x);
  }
  return out;
}
// Write a pulled value without marking it as a local change, then refresh what this page shows.
function apply(k, v) {
  try { v ? localStorage.setItem(SYNC[k], v) : localStorage.removeItem(SYNC[k]); } catch {}
  if (k === 'bm') { bms = store('yw-bm', []); bmBar(); }
  if (k === 'bmbar') showBar(store('yw-bmbar', false));
  if (k === 'hist') hist = store('yw-hist', []);
  if (k === 'sleep') invoke('set_sleep', { secs: store('yw-sleep', 300) });
  if (k === 'theme') themeApply();
  if (k === 'lang') { i18nApply(); invoke('set_lang', { lang: LANG }); }
  if (k === 'hl') notes = store('yw-hl', {});
}
async function syncNow() {
  if (!acct?.token || syncBusy) return;
  syncBusy = true; clearTimeout(syncT);
  syncStatus('Syncing…');
  const auth = { Authorization: 'Bearer ' + acct.token };
  try {
    const r = await http('/api/yukiweb/sync?since=' + (syncMeta.since || 0), { headers: auth });
    if (r.status === 401) { saveAcct(null); throw new Error('Signed out'); }
    if (!r.ok) throw new Error('Server ' + r.status);
    const { items, now } = await r.json(), first = syncMeta.first, d = { ...syncMeta.dirty };
    for (const [k, it] of Object.entries(items)) {
      if (k.startsWith('stats_') && !SYNC[k]) { if (syncOn(SYNC_STATS)) try { localStorage.setItem('yw-stats-' + k.slice(6), it.v); } catch {} continue; }
      if (!SYNC[k] || !syncOn(k)) continue;
      if (k === 'hist' || k === 'hl' || (k === 'bm' && first)) {
        const mine = parse(raw(k)), theirs = parse(it.v), merged = k === 'hist' ? mergeHist(mine, theirs) : k === 'hl' ? mergeHl(mine, theirs) : mergeBm(mine, theirs);
        const v = JSON.stringify(merged);
        apply(k, v);
        if (v !== it.v) { d[k] = 1; syncMeta.at[k] = Date.now(); } else syncMeta.at[k] = it.at;
      } else if (it.at > (syncMeta.at[k] || 0)) {
        apply(k, it.v); syncMeta.at[k] = it.at; delete d[k];
      }
    }
    // First sync: everything this PC has that the account doesn't goes up.
    if (first) for (const k of Object.keys(SYNC)) if (!items[k] && raw(k)) { d[k] = 1; syncMeta.at[k] = syncMeta.at[k] || Date.now(); }
    render();
    const push = {};
    for (const k of Object.keys(d)) if (syncOn(k)) push[k] = { v: raw(k), at: syncMeta.at[k] || Date.now() };
    if (Object.keys(push).length) {
      const p = await http('/api/yukiweb/sync', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: push }) });
      if (!p.ok) throw new Error(p.status === 413 ? 'Something is too big to sync (your wallpaper?)' : 'Server ' + p.status);
    }
    // Changes in a group that's switched off wait until it's switched back on.
    syncMeta = { ...syncMeta, since: now, first: false, dirty: Object.fromEntries(Object.keys(d).filter(k => !push[k]).map(k => [k, 1])) };
    try { localStorage.setItem('yw-sync', JSON.stringify(syncMeta)); } catch {}
    syncStatus('Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  } catch (e) {
    log('sync', String(e));
    syncStatus('Not synced: ' + (e.message || e));
  }
  syncBusy = false;
}
listen('sync-now', syncNow);
setInterval(syncNow, 3 * 60000);
if (acct?.token) setTimeout(syncNow, 3000);

// --- Session: open tabs survive restarts (and update restarts). Restored tabs stay
// placeholders until clicked, so startup only loads the one you were on. ---
let sessionT = 0, restored = false;
function saveSession() {
  if (!restored) return;
  clearTimeout(sessionT);
  sessionT = setTimeout(() => {
    const keepTabs = tabs.filter(real);
    keep('yw-session', { tabs: keepTabs.map(t => ({ u: t.url, t: t.title || '', i: t.icon || '', g: t.g })), a: Math.max(0, keepTabs.findIndex(t => t.id === active)), groups: groups.filter(g => keepTabs.some(t => t.g === g.id)) });
  }, 500);
}
function restore(link) {
  const s = store('yw-session', null);
  restored = true;
  if (!s?.tabs?.length) return newTab(link);
  groups = s.groups || [];
  tabs = s.tabs.map((x, n) => ({ id: -(n + 1), url: x.u, title: x.t, icon: x.i, g: x.g, lazy: true, zz: true }));
  if (link) return newTab(link);
  activate(tabs[Math.min(s.a || 0, tabs.length - 1)].id);
}

// --- Page tools: tab.js (in every website) posts 'tab-msg'; we answer with tab_eval. Messages are
// untrusted (any page can post them), so they only ever act on the tab that sent them.
const ev = (id, js) => invoke('tab_eval', { id, js }).then(r => { try { return JSON.parse(r) } catch { return null } }, () => null);
const pageKey = u => u.split('#')[0];
let notes = store('yw-hl', {}), lastSel = 0, findOn = false, pwAsk = null;
listen('pw-do', ({ payload: act }) => {
  const a = pwAsk;
  pwAsk = null;
  if (!a) return;
  if (act === 'save') invoke('pw_save', { tab: a.tab, user: a.user, pass: a.pass, url: a.url }).catch(e => log('pw_save', String(e)));
  else if (act === 'never') keep('yw-pw-never', [...new Set([...store('yw-pw-never', []), hostOf(a.url)])]);
});
// 0.5: passwords moved from WebView2's own saver into the vault; bring the old ones over once.
if (!store('yw-pw-mig', false)) setTimeout(() => invoke('pw_import', { from: 'webview' }).then(() => keep('yw-pw-mig', true), e => { log('pw-mig', String(e)); keep('yw-pw-mig', true); }), 6000);
const LABELS = () => ({ copy: tr('Copy'), search: tr('Search'), translate: tr('Translate'), note: tr('Highlight'), chat: tr('Send to YukiChat'), pip: tr('Picture in picture') });
const LNAME = c => { try { return new Intl.DisplayNames([LANG], { type: 'language' }).of(c) } catch { return c } };

// Google's free endpoint: many strings per request, answers [[text, from], ...].
async function gtx(list, tl) {
  const out = [];
  let batch = [], len = 0;
  const flush = async () => {
    if (!batch.length) return;
    const r = await __TAURI__.http.fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=auto&tl=${tl}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: batch.map(x => 'q=' + encodeURIComponent(x)).join('&'),
    });
    let j = await r.json();
    if (typeof j === 'string' || typeof j[0] === 'string') j = [j];
    for (const x of j) out.push(Array.isArray(x) ? x[0] : x);
    batch = []; len = 0;
  };
  for (const x of list) {
    const n = encodeURIComponent(x).length;
    if (batch.length && (len + n > 30000 || batch.length >= 100)) await flush();
    batch.push(x); len += n + 3;
  }
  await flush();
  return out;
}

// Send to YukiChat: YukiChat's ?share= opens a chat picker and drops the text in the message box.
function shareChat(text, url, title) {
  const body = text.includes(url) ? text : `${text}\n\n${title ? title + ' — ' : ''}${url}`;
  newTab(ROUTES.chat[1] + '/?share=' + encodeURIComponent(body.slice(0, 4000)));
}
async function translatePage(id) {
  const t = T(id);
  if (!t) return;
  t.trOn = true; render();
  const list = await ev(id, '__yukiweb.trCollect()') || [];
  for (let i = 0; i < list.length; i += 100) {
    if (!T(id)?.trOn) return;
    const res = await gtx(list.slice(i, i + 100), LANG).catch(e => { log('translate', String(e)); return null; });
    if (!res) break;
    await ev(id, `__yukiweb.trApply(${i}, ${JSON.stringify(res)})`);
  }
}
function trPanel() {
  const t = T(active);
  if (!t || !/^https?:/.test(t.url)) return;
  const from = t.flang || '';
  if (!panelAt('#trb', 'tr', 190)) return;
  setTimeout(() => emitTo('panel', 'tr-info', { from: from ? LNAME(from) : '?', to: LNAME(LANG), always: store('yw-trauto', []).includes(from), on: !!t.trOn }), 80);
}
listen('tr-do', ({ payload: act }) => {
  const t = T(active);
  if (!t) return;
  const auto = store('yw-trauto', []);
  if (act === 'go') translatePage(t.id);
  else if (act === 'undo') { t.trOn = false; ev(t.id, '__yukiweb.trRestore()'); render(); }
  else if (t.flang) keep('yw-trauto', act === 'always' ? [...new Set([...auto, t.flang])] : auto.filter(x => x !== t.flang));
});

function showFind() {
  const t = T(active);
  if (!t || !/^https?:/.test(t.url) || !panelAt('#omni', 'find', 54)) return;
  findOn = true;
}
listen('find-q', async ({ payload: [q, dir] }) => {
  const r = await ev(active, `__yukiweb.find(${JSON.stringify(String(q))}, ${+dir || 0})`);
  emitTo('panel', 'find-res', r || [0, 0]);
});
listen('panel-closed', () => { if (findOn) { findOn = false; ev(active, '__yukiweb.findClear()'); } });

function notesShow() {
  const t = T(active);
  if (!t || !/^https?:/.test(t.url) || !panelAt('#menu', 'notes', 420)) return;
  setTimeout(() => emitTo('panel', 'notes', notes[pageKey(t.url)] || []), 80);
}
function notesSave(k) {
  if (!notes[k]?.length) delete notes[k];
  keep('yw-hl', notes);
  const t = T(active);
  if (t && pageKey(t.url) === k) ev(t.id, `__yukiweb.hlSet(${JSON.stringify(notes[k] || [])})`);
  emitTo('panel', 'notes', notes[k] || []);
}
listen('note-edit', ({ payload: [i, text] }) => { const t = T(active), k = t && pageKey(t.url), n = k && notes[k]?.[i]; if (n) { n.note = String(text).slice(0, 2000); keep('yw-hl', notes); } });
listen('note-del', ({ payload: i }) => { const t = T(active), k = t && pageKey(t.url); if (k && notes[k]) { notes[k].splice(i, 1); notesSave(k); } });

listen('shot-do', async ({ payload: full }) => {
  const t = T(active);
  if (!t) return;
  try { emitTo('panel', 'shot', [await invoke('tab_shot', { id: t.id, full: !!full }), hostOf(t.url).replace(/^www\./, '') || 'page', '']); }
  catch (e) { emitTo('panel', 'shot', ['', '', String(e)]); }
});

let readability = null;
async function reader() {
  const t = T(active);
  if (!t || !real(t)) return;
  readability ||= await fetch('vendor/Readability.js').then(r => r.text());
  const a = await ev(t.id, `(() => { ${readability}\n const a = new Readability(document.cloneNode(true)).parse();
    return a && { title: a.title, byline: a.byline, site: a.siteName, html: a.content, len: a.length, url: location.href, lang: a.lang || document.documentElement.lang }; })()`);
  if (!a?.html) return alert(tr('This page has no article to read.'));
  try { localStorage.setItem('yw-reader', JSON.stringify(a)); } catch {}
  invoke('tab_nav', { id: t.id, url: PAGES + 'reader.html' });
}

// Moo, the built-in cow (src/moo.js). Settings → Moo writes yw-moo; every open page follows.
const MOO = { enabled: true, name: 'Clarabelle', sound: true, pies: true, size: 'm', breed: 'holstein', bell: true, calf: false, hiddenSites: [] };
const moo = () => ({ ...MOO, ...store('yw-moo', {}) });
addEventListener('storage', e => {
  if (e.key === 'yw-moo') for (const t of tabs) if (/^https?:/.test(t.url || '') && !t.url.startsWith(PAGES)) ev(t.id, `window.__ywMoo && __ywMoo(${JSON.stringify(moo())})`);
});
// Toolbar cow: the extension's popup (moo-pop.html inside panel view 'moo').
$('#moo').innerHTML = icon('cow');
$('#moo').onclick = () => {
  const t = T(active), u = t && /^https?:/.test(t.url || '') && !t.url.startsWith(PAGES) ? new URL(t.url).hostname : '';
  if (panelAt('#moo', 'moo', 600)) setTimeout(() => emitTo('panel', 'moo-site', u), 30);
};
listen('moo-do', ({ payload }) => {
  if (!['summon', 'grass'].includes(payload)) return;
  ev(active, `window.__ywMoo && (__ywMoo(${JSON.stringify(moo())}), __ywMooDo(${JSON.stringify(payload)}))`);
});
listen('tab-msg', async ({ payload: [id, raw] }) => {
  const t = T(id), m = parse(raw);
  if (!t || !m || !/^https?:/.test(t.url) || t.url.startsWith(PAGES)) return;
  if (m.k === 'moo-stats' && m.d && typeof m.d === 'object') {
    const st = store('yw-moo-stats', {});
    for (const k of ['moos', 'pets', 'grass', 'pies', 'drops']) { const n = +m.d[k]; if (n > 0 && n < 1000) st[k] = (st[k] || 0) + Math.floor(n); }
    keep('yw-moo-stats', st);
    return;
  }
  if (m.k === 'vpn-open') { if (id === active) $('#vpn').onclick(); return; }
  if (m.k === 'ready') {
    const r = await ev(id, `__yukiweb.init(${JSON.stringify({ labels: LABELS(), hl: notes[pageKey(t.url)] || [] })})`);
    t.flang = (r?.lang || '').slice(0, 2).toLowerCase();
    t.trOn = false;
    render();
    if (moo().enabled) ev(id, `window.__ywMoo && __ywMoo(${JSON.stringify(moo())})`);
    if (t.flang && t.flang !== LANG && store('yw-trauto', []).includes(t.flang)) translatePage(id);
    if (!t.priv && !store('yw-pw-off', false)) invoke('pw_for', { tab: id }).then(([rows]) => { if (rows.length) ev(id, `__yukiweb.pwOffer(${JSON.stringify(rows.map(r => ({ id: r.id, user: r.user })))}, ${JSON.stringify(tr('Saved passwords'))})`); }, () => {});
    // Pages that build themselves after load: try the highlights once more.
    if (notes[pageKey(t.url)]) setTimeout(() => ev(id, `__yukiweb.hlSet(${JSON.stringify(notes[pageKey(t.url)] || [])})`), 2500);
  } else if (m.k === 'sel' && typeof m.text === 'string') {
    if (Date.now() - lastSel < 800) return;
    lastSel = Date.now();
    const text = m.text.slice(0, 5000);
    if (m.act === 'search') newTab(searchUrl(text.slice(0, 300)));
    else if (m.act === 'translate') { const r = await gtx([text], LANG).catch(e => [String(e)]); ev(id, `__yukiweb.bubble(${JSON.stringify(r[0] || '')})`); }
    else if (m.act === 'chat') shareChat(text, t.url, t.title);
  } else if (m.k === 'pw' && typeof m.pass === 'string' && m.pass && !t.priv && !store('yw-pw-off', false)) {
    if (store('yw-pw-never', []).includes(hostOf(t.url))) return;
    const user = String(m.user || '').slice(0, 500), pass = m.pass.slice(0, 1000);
    const [, state] = await invoke('pw_for', { tab: id, user, pass }).catch(() => [[], '']);
    if (!state || state === 'same') return;
    pwAsk = { tab: id, url: t.url, user, pass };
    if (id === active && panelAt('#star', 'pw', 200)) setTimeout(() => emitTo('panel', 'pw-ask', { host: hostOf(t.url).replace(/^www\./, ''), user, update: state === 'update' }), 80);
  } else if (m.k === 'pw-pick' && Number.isInteger(m.id)) {
    invoke('pw_fill', { tab: id, id: m.id }).catch(e => log('pw_fill', String(e)));
  } else if (m.k === 'peek' && typeof m.url === 'string' && /^https?:/.test(m.url) && id === active) {
    if (Date.now() - lastSel < 800) return;
    lastSel = Date.now();
    peekOpen(m.url);
  } else if (m.k === 'meta' && typeof m.url === 'string' && /^https?:/.test(m.url)) {
    const r = await meta(m.url).catch(() => null);
    if (r) ev(id, `__yukiweb.card(${JSON.stringify(m.url)}, ${JSON.stringify(r)})`);
  } else if (m.k === 'hl-add' && typeof m.text === 'string' && !t.priv) {
    const k = pageKey(t.url);
    notes[k] = [...(notes[k] || []), { text: m.text.slice(0, 2000), c: /^[ygpb]$/.test(m.c) ? m.c : 'y', at: Date.now(), title: t.title || '' }].slice(-200);
    keep('yw-hl', notes);
  }
});

// --- Tabs: groups, split view, mute, peek, hover previews, command palette, tab search, task manager.
let groups = [], groupNext = null, split = null, peek = null, peekWant = false;
const GCOLORS = ['#7aa2ff', '#ff5c7a', '#ffd23f', '#7bd389', '#b18cff', '#ff8a3d', '#3ec7e0', '#8a8f9c'];

function setSplit(pair) {
  split = pair;
  invoke('tab_split', { pair });
  render();
}
listen('tab-audio', ({ payload: [id, audio, muted] }) => { const t = T(id); if (t) { t.audio = audio; t.muted = muted; render(); } });

// Context menus are a panel view: we send items, it answers with ctx-do [act, arg].
let ctxFor = null;
function ctxOpen(x, items, target) {
  ctxFor = target;
  const h = items.reduce((a, i) => a + (i.sep ? 9 : i.colors ? 44 : i.input != null ? 48 : 38), 16);
  if (Date.now() - panelClosed < 400) return;
  hidePop();
  invoke('panel_show', { right: x + 340, view: 'ctx', height: h });
  setTimeout(() => emitTo('panel', 'ctx', items), 60);
}
function tabMenu(id, x) {
  const t = T(id);
  if (!t) return;
  const items = [{ a: 'newright', l: 'New tab to the right', ic: 'plus' }, { sep: 1 }, { a: 'grpnew', l: 'Add to new group', ic: 'layers' }];
  for (const g of groups) if (g.id !== t.g && tabs.some(x => x.g === g.id)) items.push({ a: 'grpadd', arg: g.id, l: t2('Add to "{0}"', g.name || tr('group')), dot: g.c });
  if (t.g) items.push({ a: 'grprm', l: 'Remove from group', ic: 'x' });
  items.push({ sep: 1 });
  if (split?.includes(id)) items.push({ a: 'unsplit', l: 'Exit split view', ic: 'split' });
  else if (id !== active && !t.lazy && T(active)) items.push({ a: 'split', l: 'Split view with current tab', ic: 'split' });
  items.push({ a: 'mute', l: t.muted ? 'Unmute tab' : 'Mute tab', ic: t.muted ? 'volume' : 'mute' });
  if (!isNew(t.url)) items.push({ a: 'dup', l: 'Duplicate', ic: 'copy' });
  if (id !== active && !t.lazy && !t.zz) items.push({ a: 'sleep', l: 'Sleep now', ic: 'tasks' });
  items.push({ sep: 1 }, { a: 'others', l: 'Close other tabs', ic: 'x' }, { a: 'close', l: 'Close', ic: 'x' });
  ctxOpen(x, items, { tab: id });
}
function groupMenu(gid, x) {
  const g = groups.find(x => x.id === gid);
  if (!g) return;
  ctxOpen(x, [{ input: g.name || '', ph: 'Name this group' }, { colors: GCOLORS, cur: g.c }, { sep: 1 },
    { a: 'gcol', l: g.col ? 'Expand' : 'Collapse', ic: g.col ? 'down' : 'up' }, { a: 'gnew', l: 'New tab in group', ic: 'plus' },
    { a: 'ungroup', l: 'Ungroup', ic: 'layers' }, { a: 'gclose', l: 'Close group', ic: 'x' }], { group: gid });
}
listen('ctx-do', ({ payload: [act, arg] }) => {
  const id = ctxFor?.tab, t = id != null && T(id), g = ctxFor?.group != null && groups.find(x => x.id === ctxFor.group);
  if (t) {
    if (act === 'newright') { activate(id); groupNext = t.g ?? null; newTab(); }
    else if (act === 'grpnew') { const n = { id: Date.now(), name: '', c: GCOLORS[groups.length % GCOLORS.length] }; groups.push(n); t.g = n.id; groupMenuSoon(n.id); }
    else if (act === 'grpadd') { t.g = +arg; const i = tabs.indexOf(t); tabs.splice(i, 1); const last = tabs.map(x => x.g).lastIndexOf(t.g); tabs.splice(last + 1, 0, t); }
    else if (act === 'grprm') t.g = undefined;
    else if (act === 'split') setSplit([active, id]);
    else if (act === 'unsplit') setSplit(null);
    else if (act === 'mute') invoke('tab_mute', { id, on: !t.muted });
    else if (act === 'dup') newTab(t.url);
    else if (act === 'sleep') invoke('tab_sleep', { id });
    else if (act === 'others') tabs.filter(x => x.id !== id).forEach(x => close(x.id));
    else if (act === 'close') close(id);
  } else if (g) {
    if (act === 'name') g.name = String(arg).slice(0, 40);
    else if (act === 'color') g.c = GCOLORS.includes(arg) ? arg : g.c;
    else if (act === 'gcol') g.col = !g.col;
    else if (act === 'gnew') { const last = [...tabs].reverse().find(x => x.g === g.id); if (last) activate(last.id); groupNext = g.id; newTab(); }
    else if (act === 'ungroup') { tabs.forEach(x => { if (x.g === g.id) x.g = undefined; }); groups = groups.filter(x => x !== g); }
    else if (act === 'gclose') tabs.filter(x => x.g === g.id).forEach(x => close(x.id));
  }
  saveSession(); render();
});
// A new group opens its menu right away so it can be named.
function groupMenuSoon(gid) { render(); setTimeout(() => { const el = $(`#tabs .grp[data-g="${gid}"]`); if (el) groupMenu(gid, el.getBoundingClientRect().left); }, 450); }
const t2 = (s, ...a) => tr(s).replace(/\{(\d)\}/g, (_, n) => a[n] ?? '');

// Peek: Shift+click a link (tab.js) → it opens floating over the page. Esc or ✕ closes it.
function peekOpen(url) {
  if (peek) peekClose();
  peekWant = true;
  invoke('tab_new', { url, bg: true });
}
function peekClose() {
  if (!peek) return;
  const id = peek.id;
  peek = null;
  invoke('tab_peek', { id: null });
  invoke('tab_close', { id });
  render();
}
function peekKeep() {
  if (!peek) return;
  const { id, url } = peek;
  peek = null;
  invoke('tab_peek', { id: null });
  tabs.splice(tabs.findIndex(t => t.id === active) + 1, 0, { id, url, title: '' });
  activate(id);
}
$('#peeko').onclick = peekKeep;
$('#peekx').onclick = peekClose;

// Hover preview (Alt over a link): we fetch the page's title/description/image through the
// same local proxy the tabs use, so VPN rules apply.
const metaCache = new Map();
async function meta(url) {
  if (metaCache.has(url)) return metaCache.get(url);
  const r = await __TAURI__.http.fetch(url, { headers: { Accept: 'text/html' }, connectTimeout: 6000, ...viaProxy() });
  if (!r.ok || !/html/.test(r.headers.get('content-type') || '')) return null;
  const d = new DOMParser().parseFromString((await r.text()).slice(0, 500000), 'text/html');
  const m = n => d.querySelector(`meta[property="${n}"],meta[name="${n}"]`)?.content?.trim() || '';
  let image = m('og:image') || m('twitter:image');
  try { image = image ? new URL(image, url).href : ''; } catch { image = ''; }
  const out = { title: (m('og:title') || d.title || '').slice(0, 200), desc: (m('og:description') || m('description')).slice(0, 400), image, site: m('og:site_name').slice(0, 80) };
  metaCache.set(url, out);
  return out;
}

// Command palette (Ctrl+K, ">") and tab search (Ctrl+Shift+A, "%") live in the address bar.
const CMDS = [
  ['new', 'New tab', 'plus', 'Ctrl+T'], ['private', 'New private tab', 'lock', 'Ctrl+Shift+N'], ['reopen', 'Reopen closed tab', 'undo', 'Ctrl+Shift+T'],
  ['tabsearch', 'Search tabs', 'search', 'Ctrl+Shift+A'], ['find', 'Find on page', 'find', 'Ctrl+F'], ['reader', 'Reader mode', 'book'],
  ['translate', 'Translate page', 'languages'], ['notes', 'Notes on this page', 'hl'], ['shot', 'Screenshot', 'shot'], ['qr', 'QR code', 'qr'],
  ['pip', 'Picture in picture', 'pip'], ['bm', 'Bookmark this page', 'star', 'Ctrl+D'], ['bmbar', 'Bookmarks bar', 'star', 'Ctrl+Shift+B'],
  ['split', 'Split view with next tab', 'split'], ['unsplit', 'Exit split view', 'split'], ['mute', 'Mute or unmute tab', 'volume'],
  ['dup', 'Duplicate', 'copy'], ['send', 'Send tab to your devices', 'forward'], ['close', 'Close tab', 'x', 'Ctrl+W'], ['vpn', 'Turn VPN on/off', 'shield'],
  ['zin', 'Zoom in', 'plus'], ['zout', 'Zoom out', 'minus'], ['print', 'Print…', 'printer', 'Ctrl+P'], ['dl', 'Downloads', 'download', 'Ctrl+J'],
  ['tasks', 'Task manager', 'tasks', 'Shift+Esc'], ['wrapped', 'Wrapped', 'chart'], ['html', 'HTML playground', 'terminal'],
  ['whatsnew', "What's new", 'sparkles'], ['settings', 'Settings', 'settings'],
];
function commands(v) {
  const k = v.toLowerCase();
  return CMDS.filter(([a, l]) => !(a === 'unsplit' && !split) && !(a === 'split' && split))
    .filter(([, l]) => !k || l.toLowerCase().includes(k) || tr(l).toLowerCase().includes(k))
    .slice(0, 9).map(([a, l, ic, kb]) => ({ tag: '', ic, label: tr(l), hint: kb || '', url: 'cmd:' + a }));
}
const noQuery = u => bare(u.split(/[?#]/)[0]).toLowerCase();
function tabMatches(v, n) {
  const k = v.toLowerCase(), out = [];
  for (const t of tabs) {
    const title = t.title || hostOf(t.url);
    // Match host+path only: query strings (login ?continue=…, trackers) made unrelated tabs match.
    if (k && !title.toLowerCase().includes(k) && !noQuery(t.url).includes(k)) continue;
    if (!k && t.id === active) continue;
    out.push({ tag: '', ic: t.zz ? 'tasks' : 'layers', label: title, hint: (k ? tr('Switch to tab') + ' · ' : '') + bare(t.url), url: 'tab:' + t.id, b: bare(t.url) });
  }
  if (v.length || n > 2) for (const u of [...closed].reverse()) {
    if (out.length >= n) break;
    if (k && !noQuery(u).includes(k)) continue;
    out.push({ tag: '', ic: 'undo', label: bare(u), hint: tr('Recently closed'), url: 'tab:' + u });
  }
  return out.slice(0, n);
}
function palette(prefix) {
  invoke('ui_focus');
  q.focus();
  q.value = prefix;
  editing = true;
  suggest();
}

// Task manager: memory of all of YukiWeb + each tab's page memory.
let tasksT = 0;
async function tasksSend() {
  const procs = await invoke('proc_mem').catch(() => []);
  const rows = await Promise.all(tabs.filter(t => !t.lazy).map(async t => ({
    id: t.id, title: t.title || hostOf(t.url) || tr('New tab'), icon: t.icon || '',
    st: t.id === active ? 'active' : t.zz ? 'sleep' : t.audio ? 'audio' : '',
    heap: t.zz ? 0 : (await Promise.race([ev(t.id, 'performance.memory ? performance.memory.usedJSHeapSize : 0'), new Promise(r => setTimeout(() => r(0), 800))])) || 0,
  })));
  emitTo('panel', 'tasks', { total: procs.reduce((a, p) => a + p[2], 0), n: procs.length, rows, lazy: tabs.filter(t => t.lazy).length });
}
function tasksShow() {
  if (!panelAt('#menu', 'tasks', 520)) return;
  clearInterval(tasksT);
  tasksSend();
  tasksT = setInterval(tasksSend, 2500);
}
listen('panel-closed', () => clearInterval(tasksT));
listen('task-do', ({ payload: [act, id] }) => {
  if (act === 'sleep') invoke('tab_sleep', { id }).then(() => setTimeout(tasksSend, 400));
  else if (act === 'close') { close(id); setTimeout(tasksSend, 300); }
});

// --- Yuki apps in the browser: notifications, sending tabs to other devices, now playing, YukiMusic.
// The dashboard call (chats, mail, YUKI payments, tabs sent from other devices) runs every minute
// while signed in; the new tab page reads the same data from yw-dash-data.
var notif = [], badge = 0;
const yuki = n => { const v = Number(n) / 1e9; return (v >= 100 ? Math.round(v) : +v.toFixed(2)).toLocaleString() + ' YUKI'; };
function notifBuild() {
  const d = store('yw-dash-data', null), seen = store('yw-notif-seen', { pay: 0 });
  notif = [];
  if (!acct || !d) { badge = 0; return renderAcct(); }
  for (const x of d.inbox || []) if (x.from_dev !== DEV) notif.push({ ic: 'forward', title: x.title || bare(x.url), sub: tr('Sent from your other device'), inbox: x.id, url: x.url });
  for (const c of d.chats || []) notif.push({ ic: 'chat', img: c.avatar, title: c.name, sub: t2('{0} unread', c.unread), url: ROUTES.chat[1] + '/?chat=' + c.id });
  if (d.mail?.unread) notif.push({ ic: 'mail', title: t2('{0} unread emails', d.mail.unread), sub: d.mail.last?.[0] ? `${d.mail.last[0].sender_name || d.mail.last[0].sender_email}: ${d.mail.last[0].subject || ''}` : '', url: ROUTES.mail[1] });
  const newPay = (d.pay || []).filter(p => (p.time || 0) > seen.pay);
  for (const p of newPay) notif.push({ ic: 'wallet', title: '+' + yuki(p.amount), sub: p.name ? '@' + p.name : (p.from || '').slice(0, 14) + '…', url: ROUTES.wallet[1] + '/app' });
  badge = (d.inbox || []).filter(x => x.from_dev !== DEV).length + (d.unread || 0) + (d.mail?.unread || 0) + newPay.length;
  renderAcct();
}
function notifSend() {
  const d = store('yw-dash-data', null), t = T(active);
  emitTo('panel', 'notif', { items: notif, send: !!(t && real(t)) });
  // Opening the list counts as seeing the payments.
  const last = Math.max(0, ...(d?.pay || []).map(p => p.time || 0));
  if (last > store('yw-notif-seen', { pay: 0 }).pay) { keep('yw-notif-seen', { pay: last }); setTimeout(notifBuild, 300); }
}
listen('notif-open', async ({ payload: i }) => {
  const n = notif[i];
  if (!n) return;
  newTab(n.url);
  if (n.inbox) {
    await http('/api/yukiweb/inbox/done', { method: 'POST', headers: { Authorization: 'Bearer ' + acct.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [n.inbox] }) }).catch(() => {});
    const d = store('yw-dash-data', null);
    if (d) { d.inbox = (d.inbox || []).filter(x => x.id !== n.inbox); try { localStorage.setItem('yw-dash-data', JSON.stringify(d)); } catch {} }
    notifBuild();
  }
});
listen('notif-send', () => { const t = T(active); if (t) sendTab(t); });
async function sendTab(t) {
  if (!acct?.token || !real(t)) return;
  const r = await http('/api/yukiweb/send', { method: 'POST', headers: { Authorization: 'Bearer ' + acct.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: t.url, title: t.title || '', dev: DEV }) }).catch(() => null);
  emitTo('panel', 'notif-sent', !!r?.ok);
}
addEventListener('storage', e => { if (e.key === 'yw-dash-data') notifBuild(); });
setInterval(() => { dashAt = 0; dashFetch().then(notifBuild); }, 60000);
setTimeout(() => dashFetch().then(notifBuild), 4000);

// Play in YukiMusic: on music/video sites, the tab title makes a good search.
const MUSIC_SITES = /(^|\.)(youtube\.com|youtu\.be|spotify\.com|music\.yandex\.(ru|com|by|kz)|music\.apple\.com|soundcloud\.com|deezer\.com|vk\.com|zvuk\.com|tidal\.com|bandcamp\.com)$/;
function musicQuery(t) {
  if (!t || !real(t) || !MUSIC_SITES.test(hostOf(t.url)) || !t.title) return '';
  if (/youtube\.com$/.test(hostOf(t.url)) && !/[?&]v=|\/shorts\//.test(t.url) && !/^music\./.test(hostOf(t.url))) return '';
  let q = t.title
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*[-–—|]\s*(YouTube( Music)?|Spotify|SoundCloud|Deezer|TIDAL|Bandcamp|Звук|VK|ВКонтакте)\s*$/i, '')
    .replace(/\.?\s*(Слушать|Listen).*$/i, '')
    .replace(/ - song( and lyrics)? by /i, ' ').replace(/^Stream (.+) by (.+?)( \| .*)?$/i, '$1 $2').replace(/ by (.+) on Apple Music$/i, ' $1')
    .replace(/\s*[([](official|official video|official audio|lyrics?|lyric video|audio|video|music video|hd|4k|mv|visualizer)[^)\]]*[)\]]/gi, '')
    .replace(/\s+[—–]\s+/g, ' ').replace(/[\s|·–—-]+$/, '').trim();
  return q.length > 1 ? q.slice(0, 120) : '';
}

// Now playing: the tab that last started making sound (any site), with play/pause/next/previous.
// With nothing playing here, what YukiMusic plays on your other devices (read-only).
let npTab = null;
listen('tab-audio', ({ payload: [id, audio] }) => { if (audio) npTab = id; npRender(); });
const NP_INFO = `(() => { const m = navigator.mediaSession && navigator.mediaSession.metadata, els = [...document.querySelectorAll('video,audio')], v = els.find(x => !x.paused) || els[0];
  const art = m && m.artwork && m.artwork.length ? m.artwork[m.artwork.length - 1].src : '';
  return { title: (m && m.title) || document.title, artist: (m && m.artist) || '', art, paused: v ? v.paused : true, has: !!v }; })()`;
const npBtn = re => `(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(b => ${re}.test((b.getAttribute('aria-label') || b.getAttribute('title') || '').trim())); if (b) { b.click(); return true; } return false; })()`;
const NP_DO = {
  next: npBtn('/^(next|skip forward|следующ|nächst|weiter)/i'),
  prev: npBtn('/^(previous|prev|skip back|предыдущ|vorherig|zurück)/i'),
  toggle: `(() => { const els = [...document.querySelectorAll('video,audio')], v = els.find(x => !x.paused) || els[0]; if (v) { v.paused ? v.play() : v.pause(); return true; }
    return ${npBtn('/^(play|pause|воспроизв|пауза|wiedergabe|pausieren|abspielen)/i')}; })()`,
};
function npRender() {
  const t = npTab != null && T(npTab), remote = !t && store('yw-dash-data', null)?.music?.playing;
  const b = $('#np');
  b.hidden = !t && !remote;
  if (b.hidden) return;
  b.classList.toggle('pl', !!t?.audio);
  b.innerHTML = icon('music') + `<span>${esc(t ? t.title || hostOf(t.url) : remote.title)}</span>`;
}
async function npSend() {
  const t = npTab != null && T(npTab), remote = !t && store('yw-dash-data', null)?.music?.playing;
  if (t) emitTo('panel', 'np', { ...(await ev(t.id, NP_INFO) || { title: t.title }), host: bare(hostOf(t.url)), icon: t.icon || '' });
  else if (remote) emitTo('panel', 'np', { title: remote.title, artist: remote.artist, art: remote.cover, remote: true, url: remote.url });
}
$('#np').onclick = () => { if (panelAt('#np', 'np', 150)) setTimeout(npSend, 60); };
listen('np-do', async ({ payload: act }) => {
  const t = npTab != null && T(npTab);
  if (act === 'goto' && t) { invoke('panel_hide'); return activate(t.id); }
  if (act === 'open') { const r = store('yw-dash-data', null)?.music?.playing; invoke('panel_hide'); return r && newTab(r.url); }
  if (t && NP_DO[act]) { await ev(t.id, NP_DO[act]); setTimeout(npSend, 350); }
});
addEventListener('storage', e => { if (e.key === 'yw-dash-data') npRender(); });

// --- Wrapped: per-day stats in yw-stats { d: { 'YYYY-MM-DD': { t: { host: secs }, h: [24 hours of secs], tabs, pages, srch } } }.
// Time counts while YukiWeb is the foreground window, the PC was used in the last 2 minutes
// and the active tab is a normal website (never private tabs).
let stats = store('yw-stats', { d: {} }), statsT = 0, statsSynced = 0;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const day = () => stats.d[today()] ||= { t: {}, h: Array(24).fill(0), tabs: 0, pages: 0, srch: 0 };
const SEARCH_RE = /^https:\/\/(www\.)?(google\.[a-z.]+\/search\?|yandex\.[a-z]+\/search\/?\?|bing\.com\/search\?|duckduckgo\.com\/\?)/;
function saveStats() {
  clearTimeout(statsT);
  statsT = setTimeout(() => {
    for (const k of Object.keys(stats.d).sort().slice(0, -400)) delete stats.d[k];
    // Synced at most every 30 minutes; it grows to tens of KB.
    if (Date.now() - statsSynced > 1800000) { statsSynced = Date.now(); keep('yw-stats', stats); }
    else try { localStorage.setItem('yw-stats', JSON.stringify(stats)); } catch {}
  }, 20000);
}
function bump(f) { day()[f]++; saveStats(); }
const STEP = 15;
setInterval(async () => {
  const t = T(active);
  if (!t || !real(t) || settingsOn) return;
  const [fg, idle] = await invoke('active_state').catch(() => [false, 0]);
  if (!fg || idle > 120000) return;
  const d = day(), h = hostOf(t.url).replace(/^www\./, '');
  d.t[h] = (d.t[h] || 0) + STEP;
  d.h[new Date().getHours()] += STEP;
  saveStats();
}, STEP * 1000);

// --- New tab dashboard: newtab.html has no IPC, so it writes yw-dash-req and we fetch with the
// Yuki ID token, handing the result back in yw-dash-data (its storage event picks it up).
let dashAt = 0;
async function dashFetch() {
  if (!acct?.token || Date.now() - dashAt < 30000) return;
  dashAt = Date.now();
  try {
    const r = await http('/api/yukiweb/dash', { headers: { Authorization: 'Bearer ' + acct.token } });
    if (r.ok) localStorage.setItem('yw-dash-data', JSON.stringify({ ...(await r.json()), at: Date.now() }));
  } catch (e) { log('dash', String(e)); }
}
addEventListener('storage', e => {
  if (e.key === 'yw-dash-req') dashFetch();
  if (e.key === 'yw-lang') invoke('set_lang', { lang: LANG });
});
invoke('set_lang', { lang: LANG });

// After an update, show what changed (once per version). A fresh install just records it.
__TAURI__.app.getVersion().then(v => {
  // 0.4.0 didn't record a version: an existing session or history means an update, not a fresh install.
  const seen = store('yw-ver', null) ?? (store('yw-session', null) || store('yw-hist', null) ? 'old' : null);
  keep('yw-ver', v);
  if (seen && seen !== v) setTimeout(() => newTab(PAGES + 'whatsnew.html'), 1500);
});

// Tabs must be created after Rust knows the sign-in state (it goes into their user agent).
// launch_url: a link from another app (YukiWeb as default browser) or a .html file opened with it.
invoke('set_signed_in', { on: !!acct }).finally(() => invoke('launch_url').then(restore, () => restore()));

// --- Agents: panel docked on the right (src/agents.html + agents.js, src-tauri/src/agent.rs),
// agent tabs live in an "Agents" group and carry their agent's color.
let agOn = false;
$('#agb').onclick = () => invoke('agents_open', { open: !agOn }).catch(() => {});
listen('agents-open', ({ payload }) => { agOn = payload; $('#agb').classList.toggle('on', agOn); });
listen('agents-badge', ({ payload: n }) => { const i = $('#agb i'); i.hidden = !n; i.textContent = n; });
function agentGroup() {
  let g = groups.find(x => x.ag);
  if (!g) { g = { id: Date.now(), name: 'Agents', c: '#ff8a3d', ag: true }; groups.push(g); }
  return g.id;
}
listen('agent-tab', ({ payload: [id, name, color] }) => {
  const t = T(id);
  if (!t) return;
  t.g = agentGroup(); t.ag = color; t.agn = name;
  tabs.splice(tabs.indexOf(t), 1);
  const last = tabs.map(x => x.g).lastIndexOf(t.g);
  tabs.splice(last >= 0 ? last + 1 : tabs.length, 0, t);
  render();
});
listen('agent-mark', ({ payload: [id, on, name, color] }) => { const t = T(id); if (t) { t.ag = on ? color : null; t.agn = on ? name : null; render(); } });
listen('agent-show', ({ payload: id }) => { if (T(id)) activate(id); });
