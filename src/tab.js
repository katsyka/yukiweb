// Injected into every website tab (Rust AddScriptToExecuteOnDocumentCreated). It messages the
// browser with chrome.webview.postMessage({ yw: 1, k, ... }) and the browser calls back through
// window.__yukiweb (ExecuteScript). The page can see and call all of this, so nothing here is
// secret and the UI checks every message against the tab it came from.
(() => {
  if (window.top !== window || window.__yukiweb) return;
  const post = m => { try { chrome.webview.postMessage(JSON.stringify({ yw: 1, ...m })); } catch {} };
  // Right-click > Inspect in Yuki DevTools reads this to find the element.
  addEventListener('contextmenu', e => { Object.defineProperty(window, '__ywCtx', { value: e.composedPath()[0], configurable: true, writable: true }); }, true);
  const H = typeof Highlight === 'function' && window.CSS && CSS.highlights;
  let L = { copy: 'Copy', search: 'Search', translate: 'Translate', note: 'Highlight', chat: 'Send to YukiChat', pip: 'Picture in picture' };

  function css() {
    if (document.getElementById('__yw_css')) return;
    const s = document.createElement('style');
    s.id = '__yw_css';
    s.textContent = '::highlight(yw-find){background:#ffe36e;color:#000}::highlight(yw-cur){background:#ff9a3d;color:#000}'
      + '::highlight(yw-hl-y){background:#ffd23f99}::highlight(yw-hl-g){background:#7bd38999}::highlight(yw-hl-p){background:#ff8fb399}::highlight(yw-hl-b){background:#7aa2ff99}';
    (document.head || document.documentElement).append(s);
  }

  // Text nodes worth reading (no scripts, styles, hidden stuff, or our own toolbar).
  function texts(test) {
    const out = [], w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|TEMPLATE)$/.test(p.tagName) || p.closest('#__yw_ui')) return 2;
        return test(n) ? 1 : 3;
      },
    });
    for (let n; (n = w.nextNode());) out.push(n);
    return out;
  }
  const visible = n => n.parentElement.checkVisibility ? n.parentElement.checkVisibility() : n.parentElement.offsetParent !== null;

  // A string → a Range, even when it runs across several text nodes.
  function rangeOf(str) {
    const ns = texts(() => true);
    let all = '', at = [];
    for (const n of ns) { at.push(all.length); all += n.nodeValue; }
    const i = all.indexOf(str);
    if (i < 0) return null;
    const pos = k => { let j = at.length - 1; while (j > 0 && at[j] > k) j--; return [ns[j], k - at[j]]; };
    const r = new Range(), [a, ao] = pos(i), [b, bo] = pos(i + str.length);
    r.setStart(a, ao); r.setEnd(b, bo);
    return r;
  }

  // --- Find in page (CSS highlights: the page's DOM is never changed). ---
  let fq = null, found = [], cur = -1;
  function find(q, dir) {
    if (!H) return [0, 0];
    css();
    if (q !== fq) {
      fq = q; found = []; cur = -1;
      if (q) {
        const lq = q.toLowerCase();
        for (const n of texts(n => n.nodeValue.toLowerCase().includes(lq) && visible(n))) {
          const s = n.nodeValue.toLowerCase();
          for (let i = s.indexOf(lq); i >= 0 && found.length < 5000; i = s.indexOf(lq, i + lq.length)) {
            const r = new Range(); r.setStart(n, i); r.setEnd(n, i + q.length); found.push(r);
          }
        }
      }
      CSS.highlights.set('yw-find', new Highlight(...found));
      dir = 1;
    }
    if (!found.length) { CSS.highlights.delete('yw-cur'); return [0, 0]; }
    cur = dir ? (cur + dir + found.length) % found.length : Math.max(cur, 0);
    CSS.highlights.set('yw-cur', new Highlight(found[cur]));
    const rc = found[cur].getBoundingClientRect();
    if (rc.top < 80 || rc.bottom > innerHeight - 40) scrollBy({ top: rc.top - innerHeight / 3 });
    return [cur + 1, found.length];
  }
  function findClear() { fq = null; found = []; if (H) { CSS.highlights.delete('yw-find'); CSS.highlights.delete('yw-cur'); } }

  // --- Notes: highlighted passages, saved by the browser per page address. ---
  let notes = [];
  function hlSet(list) {
    notes = list || [];
    if (!H) return;
    css();
    const by = { y: [], g: [], p: [], b: [] };
    for (const h of notes) { const r = rangeOf(h.text); if (r) (by[h.c] || by.y).push(r); }
    for (const c of Object.keys(by)) CSS.highlights.set('yw-hl-' + c, new Highlight(...by[c]));
  }

  // --- Selection toolbar (shadow DOM so the page's styles can't reach it). ---
  let host = null, bar = null, bub = null, selText = '';
  const ICON = {
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    translate: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
    note: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  };
  function ui() {
    if (host) return;
    host = document.createElement('div');
    host.id = '__yw_ui';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;left:0;top:0';
    const sh = host.attachShadow({ mode: 'closed' });
    host.__sh = sh;
    sh.innerHTML = `<style>
      .b{position:fixed;display:flex;gap:2px;padding:4px;border-radius:12px;background:#1d1e22;box-shadow:0 6px 24px rgba(0,0,0,.28);font:13px "Segoe UI",system-ui,sans-serif}
      .b button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:none;color:#fff;cursor:pointer}
      .b button:hover{background:#3a3b42}
      .b svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .b i{display:block;width:14px;height:14px;border-radius:50%}
      .u{position:fixed;max-width:380px;max-height:240px;overflow:auto;padding:10px 12px;border-radius:12px;background:#1d1e22;color:#fff;box-shadow:0 6px 24px rgba(0,0,0,.28);font:14px/1.45 "Segoe UI",system-ui,sans-serif;white-space:pre-wrap}
          .p{position:fixed;min-width:220px;padding:4px;border-radius:10px;background:#1d1e22;box-shadow:0 8px 28px rgba(0,0,0,.3);font:13px "Segoe UI",system-ui,sans-serif}
      .p button{display:flex;align-items:center;gap:8px;width:100%;height:34px;padding:0 10px;border:0;border-radius:7px;background:none;color:#fff;font:inherit;text-align:left;cursor:pointer}
      .p button:hover{background:#3a3b42}.p small{display:block;padding:4px 10px 2px;color:#9a9cab;font-size:11px}
      .c{position:fixed;display:flex;flex-direction:column;width:330px;max-height:260px;overflow:hidden;border-radius:12px;background:#1d1e22;color:#fff;box-shadow:0 8px 28px rgba(0,0,0,.3);font:13px/1.4 "Segoe UI",system-ui,sans-serif}
      .c img{width:100%;height:120px;object-fit:cover;background:#2a2b30}
      .c div{padding:10px 12px}.c small{color:#9a9cab}.c b{display:block;margin:2px 0 4px;font-size:14px}
      .c p{margin:0;color:#c9cad2;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
    </style><div class="b" hidden></div><div class="u" hidden></div><div class="c" hidden></div><div class="p" hidden></div>`;
    bar = sh.querySelector('.b'); bub = sh.querySelector('.u');
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.a;
      if (a === 'copy') { navigator.clipboard.writeText(selText).catch(() => document.execCommand('copy')); hide(); }
      else if (a === 'note') {
        bar.innerHTML = ['y', 'g', 'p', 'b'].map(c => `<button data-a="c" data-c="${c}"><i style="background:${{ y: '#ffd23f', g: '#7bd389', p: '#ff8fb3', b: '#7aa2ff' }[c]}"></i></button>`).join('');
      } else if (a === 'c') {
        notes.push({ text: selText, c: b.dataset.c });
        hlSet(notes);
        post({ k: 'hl-add', text: selText, c: b.dataset.c });
        getSelection().removeAllRanges(); hide();
      } else if (a === 'translate') { post({ k: 'sel', act: a, text: selText }); bubble('…'); }
      else { post({ k: 'sel', act: a, text: selText }); hide(); }
    };
    document.documentElement.append(host);
  }
  function hide() { if (bar) { bar.hidden = true; bub.hidden = true; } }
  function bubble(text) {
    if (!bar || bar.hidden) return;
    const r = bar.getBoundingClientRect();
    bub.textContent = text;
    bub.hidden = false;
    bub.style.left = Math.min(r.left, innerWidth - 400) + 'px';
    bub.style.top = (r.bottom + 6) + 'px';
  }
  function showBar() {
    const s = getSelection(), text = s.toString().trim();
    const el = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement);
    if (!text || text.length > 5000 || !s.rangeCount || (el && el.closest('input,textarea,[contenteditable],#__yw_ui'))) return hide();
    ui();
    selText = text;
    bar.innerHTML = ['copy', 'search', 'translate', 'note', 'chat'].map(a => `<button data-a="${a}" title="${L[a]}"><svg viewBox="0 0 24 24">${ICON[a]}</svg></button>`).join('');
    bar.hidden = false; bub.hidden = true;
    const r = s.getRangeAt(0).getBoundingClientRect(), w = bar.offsetWidth;
    bar.style.left = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 6)) + 'px';
    bar.style.top = (r.top > 56 ? r.top - 46 : r.bottom + 8) + 'px';
  }
  document.addEventListener('mouseup', e => { if (e.button === 0 && !(host && e.composedPath().includes(host))) setTimeout(showBar, 0); }, true);
  // pointerdown too: pages that preventDefault() pointer events never fire mousedown.
  const outside = e => { if (!(host && e.composedPath().includes(host))) hide(); };
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('pointerdown', outside, true);
  // Whatever clears the selection (click, keys, script, focus moving away) also drops the bar.
  document.addEventListener('selectionchange', () => { if (bar && !bar.hidden && !getSelection().toString().trim()) hide(); });
  addEventListener('blur', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); }, true);
  addEventListener('scroll', hide, { passive: true, capture: true });

  // --- Translate the page: the browser collects text, translates it, and puts it back. ---
  let trNodes = [];
  const trOrig = new Map();
  function trCollect() {
    trNodes = texts(n => /\p{L}{2}/u.test(n.nodeValue) && !n.parentElement.closest('code,pre,kbd,samp,[translate=no],.notranslate'));
    return trNodes.slice(0, 4000).map(n => trOrig.get(n) ?? n.nodeValue);
  }
  function trApply(start, arr) {
    arr.forEach((s, i) => {
      const n = trNodes[start + i];
      if (!n || !s) return;
      if (!trOrig.has(n)) trOrig.set(n, n.nodeValue);
      const m = trOrig.get(n).match(/^(\s*)[\s\S]*?(\s*)$/);
      n.nodeValue = m[1] + s.trim() + m[2];
    });
  }
  function trRestore() { trOrig.forEach((v, n) => { n.nodeValue = v; }); trOrig.clear(); }

  // --- Picture in picture: a button on big videos (a click counts as the gesture PiP needs). ---
  let pipBtn = null;
  function pipFor(v) {
    if (!document.pictureInPictureEnabled || v.disablePictureInPicture) return;
    if (!pipBtn) {
      pipBtn = document.createElement('button');
      pipBtn.title = L.pip;
      pipBtn.style.cssText = 'all:initial;position:fixed;z-index:2147483646;display:grid;place-items:center;width:34px;height:28px;border-radius:8px;background:rgba(20,20,24,.78);cursor:pointer';
      pipBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="11" width="8" height="6" rx="1" fill="#fff"/></svg>';
      pipBtn.onclick = () => { const t = pipBtn._v; if (t) (document.pictureInPictureElement === t ? document.exitPictureInPicture() : t.requestPictureInPicture()).catch(() => {}); };
      pipBtn.onmouseleave = e => { if (e.relatedTarget !== pipBtn._v) pipBtn.remove(); };
    }
    const r = v.getBoundingClientRect();
    if (r.width < 240 || r.height < 140) return;
    pipBtn._v = v;
    pipBtn.style.left = (r.right - 44) + 'px'; pipBtn.style.top = (r.top + 10) + 'px';
    document.documentElement.append(pipBtn);
  }
  document.addEventListener('mouseover', e => { if (e.target instanceof HTMLVideoElement) pipFor(e.target); }, true);
  document.addEventListener('mouseout', e => { if (pipBtn && e.target === pipBtn._v && e.relatedTarget !== pipBtn) pipBtn.remove(); }, true);
  // From the menu: the biggest video on the page (may be refused without a click on the page).
  function pip() {
    const v = [...document.querySelectorAll('video')].sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight)[0];
    if (!v) return 'none';
    v.requestPictureInPicture().catch(() => {});
    return 'ok';
  }

  // --- Peek: Shift+click a link opens it floating over this page. ---
  const linkOf = e => { const a = e.target.closest && e.target.closest('a[href]'); return a && /^https?:/.test(a.href) ? a : null; };
  document.addEventListener('click', e => {
    const a = e.shiftKey && !e.ctrlKey && !e.altKey && e.button === 0 && linkOf(e);
    if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation();
    post({ k: 'peek', url: a.href });
  }, true);

  // --- Hover preview: hold Alt over a link; the browser fetches the page's title/description/image. ---
  let hovA = null, hovT = 0, card = null;
  function cardEl() {
    if (card) return card;
    ui();
    return (card = host.__sh.querySelector('.c'));
  }
  function cardShow(url, m) {
    if (!hovA || hovA.href !== url || !m) return;
    const c = cardEl(), r = hovA.getBoundingClientRect();
    const e = s => String(s ?? '').replace(/[&<>"]/g, x => `&#${x.charCodeAt(0)};`);
    let h = ''; try { h = new URL(url).host.replace(/^www\./, ''); } catch {}
    c.innerHTML = (m.image ? `<img src="${e(m.image)}" alt="">` : '') + `<div><small>${e(m.site || h)}</small><b>${e(m.title || url)}</b>${m.desc ? `<p>${e(m.desc)}</p>` : ''}</div>`;
    c.hidden = false;
    const top = r.bottom + 8 + 260 < innerHeight ? r.bottom + 8 : Math.max(8, r.top - 268);
    c.style.left = Math.max(8, Math.min(r.left, innerWidth - 340)) + 'px';
    c.style.top = top + 'px';
  }
  const cardHide = () => { clearTimeout(hovT); hovA = null; if (card) card.hidden = true; };
  document.addEventListener('mouseover', e => {
    const a = linkOf(e);
    if (!a || a === hovA) return;
    cardHide();
    if (!e.altKey) return;
    hovA = a;
    hovT = setTimeout(() => post({ k: 'meta', url: a.href }), 300);
  }, true);
  document.addEventListener('mouseout', e => { if (hovA && linkOf(e) === hovA && !hovA.contains(e.relatedTarget)) cardHide(); }, true);
  document.addEventListener('keyup', e => { if (e.key === 'Alt') cardHide(); }, true);

  // --- Passwords: tell the browser about a login being sent (it asks to save), and offer saved
  // accounts in login fields. Filling is done by the browser after it checks this site's address.
  let pwSent = 0, pwUsers = [], pwLabel = 'Saved passwords';
  const TEXTY = 'input:not([type=hidden]):not([type=password]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=search])';
  const pwInput = () => [...document.querySelectorAll('input[type=password]')].find(p => p.offsetParent !== null) || null;
  function userBefore(p, needValue) {
    let u = null;
    for (const i of (p.form || document).querySelectorAll(TEXTY)) if ((i.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) && (!needValue || i.value)) u = i;
    return u;
  }
  function pwCapture() {
    const p = [...document.querySelectorAll('input[type=password]')].find(x => x.value);
    if (!p || Date.now() - pwSent < 3000) return;
    pwSent = Date.now();
    post({ k: 'pw', user: (userBefore(p, true)?.value || '').slice(0, 500), pass: p.value.slice(0, 1000) });
  }
  document.addEventListener('submit', () => pwCapture(), true);
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'password') pwCapture(); }, true);
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button,input[type=submit],[role=button]');
    if (b && (b.type === 'submit' || /log ?in|sign ?in|войти|вход|anmelden|einloggen|continue|продолжить|weiter/i.test(b.textContent + ' ' + (b.value || '')))) pwCapture();
  }, true);
  function pwMenuFor(f) {
    const m = (ui(), host.__sh.querySelector('.p')), r = f.getBoundingClientRect();
    const e = s => String(s ?? '').replace(/[&<>"]/g, x => `&#${x.charCodeAt(0)};`);
    m.innerHTML = `<small>${e(pwLabel)}</small>` + pwUsers.map(u => `<button data-pw="${u.id}">🔑 ${e(u.user || '—')}</button>`).join('');
    m.hidden = false;
    m.style.left = Math.max(6, Math.min(r.left, innerWidth - 240)) + 'px';
    m.style.top = (r.bottom + 4) + 'px';
    m.onmousedown = ev => { ev.preventDefault(); const b = ev.target.closest('[data-pw]'); if (b) { post({ k: 'pw-pick', id: +b.dataset.pw }); m.hidden = true; } };
  }
  document.addEventListener('focusin', e => {
    const f = e.target, p = pwInput();
    if (!pwUsers.length || !p || !(f instanceof HTMLInputElement)) return;
    if (f === p || f === userBefore(p, false)) pwMenuFor(f);
  }, true);
  document.addEventListener('focusout', () => setTimeout(() => { const m = host && host.__sh.querySelector('.p'); if (m) m.hidden = true; }, 150), true);
  function pwFill(user, pass) {
    const p = pwInput();
    if (!p) return;
    const set = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
    const u = userBefore(p, false);
    if (u && user) set(u, user);
    set(p, pass);
  }

  window.__yukiweb = Object.freeze({
    pwFill, pwOffer(users, label) { pwUsers = users || []; if (label) pwLabel = label; },
    find, findClear, hlSet, bubble, trCollect, trApply, trRestore, pip, card: cardShow,
    // Labels in the UI language + this page's notes; answers with the page's language.
    init(cfg) { if (cfg.labels) L = { ...L, ...cfg.labels }; hlSet(cfg.hl); return { lang: document.documentElement.lang || '' }; },
  });
  const ready = () => post({ k: 'ready' });
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', ready) : ready();
})();
