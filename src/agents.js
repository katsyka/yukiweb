// Agents panel (webview "agents", docked right by agent.rs). A lead model talks to the user,
// splits the work and spawns worker agents. Browser workers drive their own background tab
// through the DevTools protocol (real input events) and read a numbered list of the page's
// interactive elements, looking at screenshots only when they need to. Desktop workers use
// desk.rs: UI Automation first (works in the background), the real mouse when an app needs it.
// Gemini only for now; the key stays on this PC (agent_key_* → DPAPI).
const { invoke } = __TAURI__.core;
const { listen, emitTo } = __TAURI__.event;
// Through YukiWeb's local proxy like the tabs, so the VPN applies (the Gemini API refuses some countries).
let proxyPort = 0;
const hfetch = async (url, opt = {}) => {
  if (!proxyPort) proxyPort = await invoke('proxy_port').catch(() => 0);
  return __TAURI__.http.fetch(url, proxyPort ? { ...opt, proxy: { all: 'http://127.0.0.1:' + proxyPort } } : opt);
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const I = d => `<svg class="i" viewBox="0 0 24 24"><path d="${d}"/></svg>`;
const IC = {
  pause: I('M9 5v14M15 5v14'), play: I('M7 5l12 7-12 7z'), x: I('M6 6l12 12M18 6L6 18'), send: I('M5 12h14M13 6l6 6-6 6'),
  gear: I('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'),
  list: I('M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01'), back: I('M15 6l-6 6 6 6'), chev: I('M7 10l5 5 5-5'), spark: I('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z'), up: I('M12 19V5M5.5 11.5L12 5l6.5 6.5'), cursor: I('M5 3l14 7-6.2 1.8L11 18z'), monitor: I('M3 5h18v11H3zM8 20h8M12 16v4'),
  globe: I('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.6 9h16.8M3.6 15h16.8M12 3c2.6 2.9 2.6 15.1 0 18M12 3c-2.6 2.9-2.6 15.1 0 18'),
  plane: I('M10.5 13.5L3 11l18-7-7 18-2.5-7.5zM10.5 13.5L21 4'), note: I('M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5'), tag: I('M3 12V4h8l10 10-8 8zM7.5 7.5h.01'),
  open: I('M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'), stop: I('M7 7h10v10H7z'), side: I('M4 4h16v16H4zM15 4v16'),
};
const ARROW = c => `<svg width="15" height="17" viewBox="0 0 20 22"><path d="M2 2 L2 18 L6.5 14 L9.5 20.5 L12.5 19 L9.5 12.8 L15.5 12.5 Z" fill="${c}" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

// ---------- Settings ----------
const MODELS = {
  'gemini-3.8-flash': ['Gemini 3.8 Flash', () => [0.75, 3.75]],
  'gemini-3.6-flash': ['Gemini 3.6 Flash', () => [1.5, 7.5]],
  'gemini-3.5-flash-lite': ['Gemini 3.5 Flash-Lite', () => [0.3, 2.5]],
  // Introductory price until Dec 1, 2026.
  'gemini-4-argon': ['Gemini 4 Argon', () => Date.now() < Date.UTC(2026, 11, 1) ? [2, 10] : [4, 20]],
};
const DEF = {
  lead: 'gemini-3.8-flash', leadThink: 'high', worker: 'gemini-3.5-flash-lite', workerThink: 'low',
  budget: 2, perAgent: 0.5, max: 6, desktop: true, logins: false, auto: false,
  ask: { pay: true, send: true, signin: true, delete: true, install: true, download: false },
  text: true, shortmem: true, sharp: false, routes: true, customIn: 1, customOut: 5,
};
const store = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } };
const S = { ...DEF, ...store('yw-agents', {}) };
S.ask = { ...DEF.ask, ...(S.ask || {}) };
// 0.7.4: workers move to the cheaper Flash-Lite unless someone picked another model on purpose.
if (!S.m074) { if (S.worker === 'gemini-3.8-flash') S.worker = DEF.worker; S.m074 = true; }
const saveS = () => { try { localStorage.setItem('yw-agents', JSON.stringify(S)) } catch {} };
// Models the key can use (fetched from Google), on top of the ones we know prices for.
let extra = store('yw-agents-models', []);
const modelIds = () => [...Object.keys(MODELS), ...extra.filter(m => !MODELS[m])];
const mname = m => MODELS[m] ? MODELS[m][0] : m;
async function fetchModels() {
  try {
    const r = await hfetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': KEY } });
    const j = await r.json();
    extra = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')).filter(m => /^gemini-/.test(m) && !/embed|image|tts|audio|live|robotics|lyria|veo/.test(m));
    localStorage.setItem('yw-agents-models', JSON.stringify(extra));
  } catch {}
}
const price = m => MODELS[m] ? MODELS[m][1]() : [+S.customIn || 0, +S.customOut || 0];
const money = v => '$' + (v < 0.1 && v > 0 ? v.toFixed(3) : v.toFixed(2));
let KEY = '';
let spent = 0, toks = 0;
const ktok = n => n < 1000 ? String(n) : n < 1e6 ? (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'k' : (n / 1e6).toFixed(n < 1e7 ? 2 : 1) + 'M';
let pausedAll = false;

// ---------- Gemini ----------
class BudgetError extends Error {}
const T = { S: 'STRING', I: 'INTEGER', N: 'NUMBER', B: 'BOOLEAN' };
const fn = (name, description, props = {}, required = []) => ({
  name, description,
  parameters: { type: 'OBJECT', properties: Object.fromEntries(Object.entries(props).map(([k, [t, d, e]]) => [k, { type: T[t], description: d, ...(e ? { enum: e } : {}) }])), required },
});

const noRes = new Set(); // models that reject mediaResolution
async function gem(model, think, system, contents, tools, who) {
  if (spent >= S.budget) throw new BudgetError(`Session budget of ${money(S.budget)} reached`);
  if (who && who.cost >= who.limit) throw new BudgetError(`${who.name} reached its ${money(who.limit)} limit`);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    tools: [{ functionDeclarations: tools }],
    toolConfig: { functionCallingConfig: { mode: 'ANY' } },
    generationConfig: {
      ...(think && think !== 'off' ? { thinkingConfig: { thinkingLevel: think } } : {}),
      // Medium detail is half the tokens of the default per screenshot and still enough to read buttons.
      ...(S.sharp || noRes.has(model) ? {} : { mediaResolution: 'MEDIA_RESOLUTION_MEDIUM' }),
    },
  };
  let r;
  for (let i = 0; ; i++) {
    try {
      r = await hfetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body),
      });
    } catch (e) {
      if (i >= 3) throw new Error('No connection to Gemini: ' + (e.message || e));
      await sleep(1500 * (i + 1)); continue;
    }
    if ((r.status === 429 || r.status >= 500) && i < 4) { await sleep(2500 * 2 ** i); continue; }
    if (r.status === 400 && body.generationConfig.mediaResolution) {
      const t = await r.clone().text().catch(() => '');
      if (/media.?resolution/i.test(t)) { noRes.add(model); delete body.generationConfig.mediaResolution; continue; }
    }
    break;
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Gemini error ${r.status}`);
  const u = j.usageMetadata || {}, [pi, po] = price(model);
  const cached = u.cachedContentTokenCount || 0;
  const cost = (((u.promptTokenCount || 0) - cached * 0.9) * pi + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * po) / 1e6;
  const n = u.totalTokenCount || (u.promptTokenCount || 0) + (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  spent += cost; toks += n;
  if (who) { who.cost += cost; who.tok = (who.tok || 0) + n; }
  try {
    localStorage.setItem('yw-agents-total', String(+(localStorage.getItem('yw-agents-total') || 0) + cost));
    localStorage.setItem('yw-agents-tokens', String(+(localStorage.getItem('yw-agents-tokens') || 0) + n));
  } catch {}
  const cand = j.candidates?.[0], content = cand?.content;
  if (!content?.parts?.length) throw new Error(cand?.finishReason ? 'The model stopped: ' + cand.finishReason : 'Empty answer from Gemini');
  content.role = 'model';
  return {
    content,
    calls: content.parts.filter(p => p.functionCall).map(p => p.functionCall),
    text: content.parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim(),
  };
}
const fr = (c, response) => ({ functionResponse: { name: c.name, ...(c.id ? { id: c.id } : {}), response: response && typeof response === 'object' ? response : { result: String(response) } } });

// History ends with model function calls but no answers (after an error): answer them so the next request is valid.
function mendHist(hist) {
  const last = hist[hist.length - 1];
  if (last?.role === 'model' && last.parts.some(p => p.functionCall)) {
    hist.push({ role: 'user', parts: last.parts.filter(p => p.functionCall).map(p => fr(p.functionCall, { error: 'interrupted' })) });
  }
}

// ---------- Agents ----------
const COLORS = ['#C2410C', '#1864AB', '#2B8A3E', '#6741D9', '#C2255C', '#0B7285', '#5C940D', '#B35C00'];
const NAMES = ['Scout', 'Atlas', 'Pike', 'Nova', 'Juno', 'Rook', 'Echo', 'Vega', 'Iris', 'Moss'];
const agents = [];
let nameNext = 0;
const A = n => agents.find(a => a.name.toLowerCase() === String(n || '').toLowerCase().replace(/^@/, ''));
const live = () => agents.filter(a => !a.stopped && !a.finished);

function newAgent(kind, task, startUrl, want) {
  const used = new Set(agents.map(a => a.name));
  let name = kind === 'desk' && !used.has('Desk') ? 'Desk' : want && /^[A-Za-z][\w-]{1,11}$/.test(want) && !used.has(want) ? want : null;
  while (!name) { const n = NAMES[nameNext++ % NAMES.length] + (nameNext > NAMES.length ? Math.ceil(nameNext / NAMES.length) : ''); if (!used.has(n)) name = n; }
  const a = {
    name, kind, task, startUrl, color: COLORS[agents.length % COLORS.length],
    tab: null, step: 0, cost: 0, limit: S.perAgent, hist: [], pending: [], inbox: [], log: [],
    status: 'Starting', hold: null, paused: pausedAll, stopped: false, finished: false, running: false,
    vw: 1280, vh: 800, cur: null, thumb: null, wantLook: true, errs: 0, showLog: false,
  };
  agents.push(a);
  draw();
  return a;
}

function wake(a) { const w = a.wake; a.wake = null; w?.(); }
const nap = a => new Promise(r => { a.wake = r; });
function hold(a, h) { a.hold = h; draw(); badge(); }
function unhold(a) { a.hold = null; draw(); badge(); wake(a); }

async function start(a) {
  try {
    if (a.kind === 'tab') {
      a.tab = await invoke('agent_tab', { url: normUrl(a.startUrl) || homeUrl(), private: !S.logins, name: a.name, color: a.color });
    } else if (a.kind === 'mine') {
      await invoke('agent_adopt', { id: a.tab, on: true, name: a.name, color: a.color });
    }
  } catch (e) {
    a.finished = true; a.status = 'Couldn\'t start: ' + e; draw();
    leadEvent(`Agent ${a.name} couldn't start: ${e}`);
    return;
  }
  run(a);
}

async function run(a) {
  if (a.running) return;
  a.running = true; a.finished = false;
  while (!a.stopped && !a.finished) {
    if (a.hold || a.paused) { a.status = a.paused ? 'Paused' : a.status; draw(); await nap(a); continue; }
    if (a.step && a.step % 60 === 0 && a.askedAt !== a.step) {
      a.askedAt = a.step;
      const ans = await ask(a, `I've taken ${a.step} steps on this. Should I keep going?`);
      if (/^(no|stop|n)\b/i.test(ans)) { finish(a, false, 'Stopped by the user after ' + a.step + ' steps'); break; }
      continue;
    }
    let obs;
    a.status = 'Looking'; draw();
    try { obs = a.kind === 'desk' ? await observeDesk(a) : await observeTab(a); }
    catch (e) { obs = { text: `Step ${a.step + 1}. Couldn't read the ${a.kind === 'desk' ? 'screen' : 'page'}: ${e.message || e}` }; }
    if (a.stopped) break;
    if (obs.touched) { hold(a, { kind: 'takeover' }); a.status = 'You took over'; draw(); continue; }
    const parts = [...a.pending];
    if (a.inbox.length) parts.push({ text: 'Message for you: ' + a.inbox.splice(0).join('\n') });
    if (a.nudge) { parts.push({ text: 'Reminder: always answer with a function call.' }); a.nudge = false; }
    parts.push({ text: obs.text });
    if (obs.img) parts.push({ inlineData: { mimeType: 'image/jpeg', data: obs.img } });
    a.pending = [];
    a.hist.push({ role: 'user', parts, obs: true });
    a.status = 'Thinking'; draw();
    let r;
    try {
      r = await gem(S.worker, S.workerThink, workerSys(a), contentsOf(a), a.kind === 'desk' ? DESK_TOOLS : TAB_TOOLS, a);
      a.errs = 0;
    } catch (e) {
      a.hist.pop();
      a.pending = parts.filter(p => p.functionResponse);
      if (e instanceof BudgetError) { hold(a, { kind: 'budget', text: e.message }); a.status = 'Out of budget'; continue; }
      if (++a.errs >= 3) { finish(a, false, 'Gemini kept failing: ' + e.message); break; }
      a.status = 'Retrying: ' + e.message; draw();
      await sleep(3000 * a.errs);
      continue;
    }
    a.hist.push(r.content);
    a.step++;
    if (!r.calls.length) { if (r.text) chat('ag', r.text, a); a.nudge = true; continue; }
    const resp = [];
    for (const c of r.calls) {
      if (a.stopped || a.finished) { resp.push(fr(c, { error: 'skipped' })); continue; }
      let out;
      try { out = await act(a, c); }
      catch (e) {
        if (String(e.message || e) === 'user') { hold(a, { kind: 'takeover' }); a.status = 'You took over'; out = { error: 'The user took over the mouse. Wait until they hand back control, then look again.' }; }
        else out = { error: String(e.message || e) };
      }
      resp.push(fr(c, out));
    }
    a.pending = resp;
  }
  a.running = false;
  draw();
}

function finish(a, ok, result) {
  a.finished = true;
  a.status = ok ? 'Done' : 'Stopped';
  a.result = result;
  draw(); badge();
  if (a.kind === 'mine') { invoke('agent_adopt', { id: a.tab, on: false, name: a.name, color: a.color }); hideCursor(a); }
  if (a.kind === 'desk') invoke('desk_cursor', { show: false, x: 0, y: 0, name: '', color: '', label: '', click: false });
  if (ok && S.routes) remember(a);
  leadEvent(`Agent ${a.name} ${ok ? 'finished' : 'stopped'}: ${result}`);
}

function stop(a, why = 'Stopped by the user') {
  if (a.stopped) return;
  a.stopped = true; a.status = 'Stopped'; a.hold = null; wake(a);
  if (!a.finished) { a.finished = true; leadEvent(`Agent ${a.name} was stopped: ${why}`); }
  if (a.kind === 'mine') { invoke('agent_adopt', { id: a.tab, on: false, name: a.name, color: a.color }); hideCursor(a); }
  if (a.kind === 'desk') invoke('desk_cursor', { show: false, x: 0, y: 0, name: '', color: '', label: '', click: false });
  draw(); badge();
}

function message(a, text) {
  if (a.hold?.kind === 'ask') { a.answer = text; unhold(a); return; }
  a.inbox.push(text);
  if (a.stopped) return;
  if (a.finished && !a.running) { a.finished = false; a.status = 'Working'; run(a); }
  wake(a);
}

// Asks the user something from inside an agent's turn.
async function ask(a, q) {
  a.answer = '';
  chat('ag', q, a);
  hold(a, { kind: 'ask', text: q });
  a.status = 'Needs you';
  while (a.hold?.kind === 'ask' && !a.stopped) await nap(a);
  return a.answer || '';
}
async function approve(a, text) {
  if (S.auto) return true;
  a.approved = false;
  hold(a, { kind: 'approve', text });
  a.status = 'Needs you';
  while (a.hold?.kind === 'approve' && !a.stopped) await nap(a);
  return a.approved;
}

// ---------- Prompts & tools ----------
const today = () => new Date().toDateString();
function workerSys(a) {
  const tips = a.tips ? `\n\nNotes from earlier successful runs on this site (may be outdated):\n${a.tips}` : '';
  if (a.kind === 'desk') return `You are ${a.name}, a desktop agent inside the YukiWeb browser, controlling the user's Windows PC.
Your task: ${a.task}

Each turn you get the open windows, a numbered list of elements in the front window [ref] (from Windows UI Automation), and sometimes a screenshot of the main screen.
- Prefer refs: click/type on a ref works even without moving the mouse. Use click_at with 0-1000 coordinates (relative to the screenshot) only for things not in the list.
- open_app starts programs (e.g. "notepad", "excel", "calc", a file path or an ms-settings: link). focus_window brings a window to the front.
- Call look when you need to see the screen. The user may be using the PC too: be quick and don't touch windows unrelated to your task.
- Never delete files, uninstall, change system settings or send anything unless the task clearly asks for it; set sensitive=true on such actions.
- Use ask_user when only the user knows something. Call done with a short concrete result when finished. Today is ${today()}.${tips}`;
  return `You are ${a.name}, a browser agent inside the YukiWeb browser. You control one browser tab.
Your task: ${a.task}

Each turn you get the page: URL, a numbered list of interactive elements [ref] visible on screen, visible text, and sometimes a screenshot.
- Prefer refs. Use click_at with 0-1000 coordinates (relative to the screenshot) only for things not in the list. Call look to get a screenshot when the text isn't enough (maps, canvases, images, layout).
- Scroll to see more of the page. You may chain a few safe actions in one turn (e.g. type then press Enter).
- Read facts from the page; never invent them. Close cookie banners when they block the page.
- Don't enter payment details or passwords the user didn't give you. Set sensitive=true on anything that pays, sends, signs in, deletes, installs or can't be undone.
- Use ask_user when only the user knows something. Use report rarely for important progress. Call done with a short concrete result (names, prices, links) when finished.
- The colored arrow labeled "${a.name}" on the page is your own cursor; ignore it. Today is ${today()}.${tips}`;
}

const SENSITIVE = ['B', 'True if this action pays, sends, signs in, deletes, installs, downloads or cannot be undone'];
const COMMON = [
  fn('look', 'Get a screenshot with the next observation.'),
  fn('wait', 'Wait for something to load.', { seconds: ['N', 'Seconds, up to 10'] }, ['seconds']),
  fn('ask_user', 'Ask the user a question and wait for the answer.', { question: ['S', 'The question'] }, ['question']),
  fn('report', 'Tell the user about important progress (keeps working).', { text: ['S', 'Short update'] }, ['text']),
  fn('done', 'Finish the task.', { result: ['S', 'What you found or did, concrete and short'], success: ['B', 'Whether the task succeeded'] }, ['result', 'success']),
];
const TAB_TOOLS = [
  fn('click', 'Click an element from the list.', { ref: ['I', 'Element ref'], sensitive: SENSITIVE }, ['ref']),
  fn('click_at', 'Click a point on the last screenshot (0-1000 on each axis).', { x: ['N', '0-1000 from the left'], y: ['N', '0-1000 from the top'], double: ['B', 'Double click'], sensitive: SENSITIVE }, ['x', 'y']),
  fn('type', 'Type text, into an element if ref is given (else where the focus is).', { ref: ['I', 'Element ref'], text: ['S', 'Text to type'], clear: ['B', 'Replace what is already there'], enter: ['B', 'Press Enter after'], sensitive: SENSITIVE }, ['text']),
  fn('select', 'Choose an option in a <select> element.', { ref: ['I', 'Element ref'], option: ['S', 'Option text'] }, ['ref', 'option']),
  fn('key', 'Press keys, e.g. "Enter", "Escape", "ctrl+a", "PageDown".', { keys: ['S', 'Keys joined with +'] }, ['keys']),
  fn('scroll', 'Scroll the page.', { direction: ['S', 'up or down', ['up', 'down']], amount: ['N', 'Screens to scroll, default 1'] }, ['direction']),
  fn('navigate', 'Open a URL in your tab.', { url: ['S', 'Address'] }, ['url']),
  fn('back', 'Go back to the previous page.'),
  ...COMMON,
];
const DESK_TOOLS = [
  fn('click', 'Click an element from the list (works in the background when the app allows it).', { ref: ['I', 'Element ref'], sensitive: SENSITIVE }, ['ref']),
  fn('click_at', 'Click a point on the last screenshot (0-1000 on each axis).', { x: ['N', '0-1000 from the left'], y: ['N', '0-1000 from the top'], button: ['S', 'left, right or double', ['left', 'right', 'double']], sensitive: SENSITIVE }, ['x', 'y']),
  fn('type', 'Type text, into an element if ref is given (else into the focused window).', { ref: ['I', 'Element ref'], text: ['S', 'Text'], enter: ['B', 'Press Enter after'], sensitive: SENSITIVE }, ['text']),
  fn('key', 'Press keys, e.g. "enter", "ctrl+s", "alt+tab", "win+r".', { keys: ['S', 'Keys joined with +'] }, ['keys']),
  fn('scroll', 'Scroll at a point of the screenshot.', { direction: ['S', 'up or down', ['up', 'down']], amount: ['N', 'Notches, default 3'], x: ['N', '0-1000'], y: ['N', '0-1000'] }, ['direction']),
  fn('drag', 'Drag from one point to another (0-1000 coordinates).', { x: ['N', ''], y: ['N', ''], x2: ['N', ''], y2: ['N', ''] }, ['x', 'y', 'x2', 'y2']),
  fn('open_app', 'Start a program, file or link.', { name: ['S', 'e.g. notepad, excel, calc, C:\\path\\file.xlsx'] }, ['name']),
  fn('focus_window', 'Bring a window to the front by (part of) its title.', { title: ['S', 'Window title'] }, ['title']),
  ...COMMON,
];

function leadSys() {
  return `You are the lead of a team of AI agents inside YukiWeb, a web browser on the user's Windows PC. The user talks to you here.
- Split the user's request into independent jobs and spawn agents to do them in parallel (at most ${S.max} working at once). Kinds:
  browser = its own background tab; desktop = controls Windows apps (${S.desktop ? 'only one at a time' : 'DISABLED in settings, don\'t use'}); my_tab = works in the tab the user has open (only when they mean "this page/tab").
- Each agent sees only the task you give it: make it complete and self-contained, with a start_url when obvious. Don't spawn agents for simple questions you can answer yourself.
- Use say for short updates and final answers (concrete: names, numbers, links). After spawning or messaging agents, call wait. When agents finish, combine their results, say the answer, and wait.
- If an agent fails, decide whether to retry differently or tell the user. Today is ${today()}.`;
}
const LEAD_TOOLS = [
  fn('spawn_agent', 'Start a new agent.', { task: ['S', 'Complete self-contained task'], where: ['S', 'browser, desktop or my_tab', ['browser', 'desktop', 'my_tab']], start_url: ['S', 'Page to start on (browser)'], name: ['S', 'Optional short name'] }, ['task', 'where']),
  fn('message_agent', 'Send instructions to an agent (also restarts a finished one).', { name: ['S', 'Agent name'], text: ['S', 'Message'] }, ['name', 'text']),
  fn('stop_agent', 'Stop an agent.', { name: ['S', 'Agent name'] }, ['name']),
  fn('say', 'Say something to the user.', { text: ['S', 'Message'] }, ['text']),
  fn('wait', 'End your turn and wait for the user or the agents.'),
];

function team() {
  if (!agents.length) return 'No agents yet.';
  return 'Team: ' + agents.map(a => `${a.name} (${a.kind === 'desk' ? 'desktop' : a.kind === 'mine' ? 'my_tab' : 'browser'}, ${a.stopped ? 'stopped' : a.finished ? 'finished' : a.hold ? 'waiting for the user' : 'working'}, step ${a.step}): ${a.task.slice(0, 120)}`).join('\n');
}

// Old screenshots and page dumps go out of the conversation: they're most of the cost.
function contentsOf(a) {
  const idx = a.hist.map((h, i) => h.obs ? i : -1).filter(i => i >= 0);
  const noImg = new Set(idx.slice(0, -(S.shortmem ? 2 : 8)));
  const noObs = new Set(idx.slice(0, -(S.shortmem ? 3 : 12)));
  return a.hist.map((h, i) => {
    if (!h.obs) return h;
    let parts = h.parts;
    if (noImg.has(i)) parts = parts.filter(p => !p.inlineData);
    if (noObs.has(i)) parts = parts.map(p => p.text && p.text.startsWith('Step ') ? { text: '[earlier screen state removed]' } : p);
    return { role: 'user', parts };
  });
}

// ---------- Lead ----------
const lead = { hist: [], pending: [], queue: [], busy: false };
function leadEvent(text) {
  lead.queue.push(text);
  if (!lead.busy && KEY) leadRun();
}
async function leadRun() {
  lead.busy = true; thinking(true);
  try {
    while (lead.queue.length) {
      const texts = lead.queue.splice(0);
      lead.hist.push({ role: 'user', parts: [...lead.pending, { text: texts.join('\n\n') + '\n\n' + team() }] });
      lead.pending = [];
      for (let i = 0; i < 12; i++) {
        const r = await gem(S.lead, S.leadThink, leadSys(), lead.hist, LEAD_TOOLS, null);
        lead.hist.push(r.content);
        if (!r.calls.length) { if (r.text) chat('lead', r.text); break; }
        const resp = [];
        let done = false;
        for (const c of r.calls) {
          let out;
          try { out = await leadDo(c); } catch (e) { out = { error: String(e.message || e) }; }
          resp.push(fr(c, out));
          if (c.name === 'wait') done = true;
        }
        if (done) { lead.pending = resp; break; }
        lead.hist.push({ role: 'user', parts: resp });
      }
    }
  } catch (e) {
    mendHist(lead.hist);
    chat('sys', e instanceof BudgetError ? e.message + '. Raise it in settings to continue.' : 'Lead: ' + (e.message || e));
  }
  lead.busy = false; thinking(false);
}

async function leadDo(c) {
  const g = c.args || {};
  if (c.name === 'say') { chat('lead', String(g.text || '')); return { ok: true }; }
  if (c.name === 'wait') return { ok: true };
  if (c.name === 'stop_agent') { const a = A(g.name); if (!a) return { error: 'No agent named ' + g.name }; stop(a, 'stopped by the lead'); return { ok: true }; }
  if (c.name === 'message_agent') { const a = A(g.name); if (!a) return { error: 'No agent named ' + g.name }; message(a, String(g.text || '')); return { ok: true }; }
  if (c.name === 'spawn_agent') {
    if (live().length >= S.max) return { error: `Already ${S.max} agents working (the user's limit). Wait for one to finish.` };
    const where = g.where || 'browser';
    if (where === 'desktop') {
      if (!S.desktop) return { error: 'Desktop agents are turned off in settings.' };
      if (live().some(a => a.kind === 'desk')) return { error: 'A desktop agent is already working; message it instead.' };
    }
    let tab = null;
    if (where === 'my_tab') {
      tab = await invoke('agent_active');
      if (!S.auto && !(await confirmChat(`Let an agent work in the tab you have open?\n“${String(g.task).slice(0, 160)}”`))) return { error: 'The user said no to using their tab.' };
    }
    const a = newAgent(where === 'desktop' ? 'desk' : where === 'my_tab' ? 'mine' : 'tab', String(g.task || ''), g.start_url, g.name);
    if (tab != null) a.tab = tab;
    a.tips = tipsFor(g.start_url);
    start(a);
    return { ok: true, name: a.name };
  }
  return { error: 'Unknown tool' };
}

// ---------- Browser tab agents ----------
// Installed in the agent's page (and re-installed after each navigation). Untrusted page, so it only
// reports; everything that matters is checked here.
function installAg() {
  if (window.__ywAg) return;
  const A = window.__ywAg = { els: [], touched: 0, last: null, on: false };
  addEventListener('pointerdown', e => {
    const l = A.last;
    if (l && Date.now() - l.t < 2500 && Math.abs(e.clientX - l.x) < 8 && Math.abs(e.clientY - l.y) < 8) return;
    if (A.on) A.touched = Date.now();
  }, true);
  // New windows would escape the agent: keep links in this tab while an agent drives it.
  addEventListener('click', e => { const t = A.on && e.target.closest && e.target.closest('a[target]'); if (t && t.target !== '_self') t.target = '_self'; }, true);
  const wo = window.open;
  window.open = function (u, ...r) { if (A.on && u) { location.href = new URL(u, location.href).href; return null; } return wo.call(this, u, ...r); };
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,label[for],[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=textbox],[role=switch],[role=searchbox],[contenteditable=""],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const lab = el => {
    const t = el.tagName.toLowerCase();
    let s = el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || '';
    if (!s && !/^(input|select|textarea)$/.test(t)) s = el.innerText || el.textContent || '';
    if (!s) s = el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('name') || (el.querySelector && el.querySelector('img[alt]') && el.querySelector('img[alt]').alt) || '';
    if (!s && t === 'input' && /submit|button/.test(el.type)) s = el.value;
    return String(s).replace(/\s+/g, ' ').trim().slice(0, 80);
  };
  A.snap = () => {
    const W = innerWidth, H = innerHeight, items = [];
    let below = 0;
    A.els = [];
    for (const el of document.querySelectorAll(SEL)) {
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      if (r.top > H) { below++; continue; }
      if (r.bottom < 0 || r.right < 0 || r.left > W || items.length >= 160) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), W - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), H - 1);
      const top = document.elementFromPoint(cx, cy);
      if (top && !(el === top || el.contains(top) || top.contains(el)) && !(el.labels && [...el.labels].some(l => l.contains(top)))) continue;
      const t = el.tagName.toLowerCase();
      const role = el.getAttribute('role') || (t === 'a' ? 'link' : t === 'input' ? (el.type || 'text') : t);
      let label = lab(el);
      if (!label && t === 'a') label = (el.getAttribute('href') || '').slice(0, 60);
      const x = [];
      if (/^(input|textarea)$/.test(t)) {
        if (el.type === 'checkbox' || el.type === 'radio') x.push(el.checked ? 'checked' : 'unchecked');
        else if (el.value && el.type !== 'password') x.push('value="' + String(el.value).slice(0, 60) + '"');
        else if (el.value) x.push('filled');
      }
      if (t === 'select') x.push('selected="' + ((el.selectedOptions[0] || {}).text || '') + '"');
      if (el.disabled) x.push('disabled');
      if (document.activeElement === el) x.push('focused');
      items.push([A.els.push(el) - 1, role, label, x.join(' ')]);
    }
    let text = '', n = 0;
    const w = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    for (let nd; (nd = w.nextNode()) && text.length < 2200 && n < 6000; n++) {
      const p = nd.parentElement;
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) continue;
      const s = nd.nodeValue.replace(/\s+/g, ' ').trim();
      if (s.length < 2) continue;
      const r = p.getBoundingClientRect();
      if (r.bottom < 0 || r.top > H || !r.width) continue;
      text += s + ' | ';
    }
    return { url: location.href, title: document.title, w: W, h: H, sy: Math.round(scrollY), sh: document.documentElement.scrollHeight, items, below, text, ready: document.readyState, touched: A.touched, pw: !!document.querySelector('input[type=password]') };
  };
  A.rect = ref => {
    const el = A.els[ref];
    if (!el || !el.isConnected) return null;
    let r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) { el.scrollIntoView({ block: 'center', inline: 'center' }); r = el.getBoundingClientRect(); }
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: lab(el), pw: el.type === 'password', tag: el.tagName.toLowerCase() };
  };
  A.at = (x, y) => { const el = document.elementFromPoint(x, y), t = el && (el.closest('a,button,[role=button],input,label,[onclick]') || el); return t ? lab(t) : ''; };
  A.focus = (ref, clear) => {
    const el = A.els[ref];
    if (!el || !el.isConnected) return false;
    el.focus();
    if (clear) { if (el.select) el.select(); else { const s = getSelection(), r = document.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r); } }
    return true;
  };
  A.select = (ref, opt) => {
    const el = A.els[ref];
    if (!el || el.tagName !== 'SELECT') return { error: 'Not a select element' };
    const o = [...el.options].find(o => o.text.trim().toLowerCase() === opt.toLowerCase()) || [...el.options].find(o => o.text.toLowerCase().includes(opt.toLowerCase()));
    if (!o) return { error: 'No such option. Options: ' + [...el.options].map(o => o.text.trim()).slice(0, 40).join(' | ') };
    el.value = o.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true };
  };
  let host, c, sp;
  A.cur = (x, y, name, color, label, click) => {
    if (!host) {
      host = document.createElement('yw-agent-cursor');
      host.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';
      const sh = host.attachShadow({ mode: 'closed' });
      sh.innerHTML = '<style>#c{position:fixed;left:0;top:0;display:flex;gap:1px;pointer-events:none;transition:transform .32s cubic-bezier(.2,.8,.2,1)}span{margin-top:14px;padding:2px 8px;border-radius:9px;font:600 11px/1.5 system-ui,sans-serif;color:#fff;white-space:nowrap}.r{position:fixed;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;border:2px solid;animation:r .5s ease-out forwards}@keyframes r{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}</style><div id="c"><svg width="20" height="22" viewBox="0 0 20 22"><path d="M2 2 L2 18 L6.5 14 L9.5 20.5 L12.5 19 L9.5 12.8 L15.5 12.5 Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span></span></div>';
      A.sh = sh; c = sh.getElementById('c'); sp = sh.querySelector('span');
    }
    if (!host.isConnected) document.documentElement.append(host);
    c.style.transform = `translate(${x - 2}px,${y - 2}px)`;
    c.querySelector('path').setAttribute('fill', color);
    sp.style.background = color;
    sp.textContent = label ? name + ' · ' + label : name;
    if (click) {
      A.last = { x, y, t: Date.now() };
      const r = document.createElement('div');
      r.className = 'r'; r.style.left = x + 'px'; r.style.top = y + 'px'; r.style.borderColor = color;
      A.sh.append(r); setTimeout(() => r.remove(), 600);
    }
    return true;
  };
  A.hide = () => { if (host) host.remove(); A.on = false; };
}
const INSTALL = `(${installAg})();`;
const ev = (a, js) => invoke('tab_eval', { id: a.tab, js: INSTALL + js }).then(r => { try { return JSON.parse(r) } catch { return null } });
const cdp = (a, method, params) => invoke('dev_cdp', { id: a.tab, method, params: JSON.stringify(params || {}) });
const hideCursor = a => a.tab != null && invoke('tab_eval', { id: a.tab, js: 'window.__ywAg && __ywAg.hide()' }).catch(() => {});

async function observeTab(a) {
  let s;
  for (let i = 0; i < 12; i++) {
    s = await ev(a, '__ywAg.on = true; __ywAg.snap()').catch(() => null);
    if (s && (s.ready === 'complete' || i >= 6)) break;
    await sleep(500);
  }
  if (!s) throw new Error("the page didn't answer");
  const touched = s.touched && s.touched > (a.lastAct || 0) && a.step > 0;
  if (touched) await ev(a, '__ywAg.touched = 0');
  a.vw = s.w; a.vh = s.h; a.url = s.url;
  const look = a.wantLook || !S.text || s.items.length < 3 || a.step % 8 === 0 || a.lastFail;
  a.wantLook = false; a.lastFail = false;
  let img = null;
  if (look) {
    try { img = (await cdp(a, 'Page.captureScreenshot', { format: 'jpeg', quality: 60 })).data; } catch {}
  }
  const els = s.items.map(([r, role, label, x]) => `[${r}] ${role} "${label}"${x ? ' ' + x : ''}`).join('\n');
  const text = `Step ${a.step + 1}. URL: ${s.url}\nTitle: ${s.title}\nViewport ${s.w}x${s.h}, scrolled ${s.sy} of ${s.sh}px${s.below ? `, ${s.below} more elements below` : ''}.\n` +
    `Elements:\n${els || '(none found: call look)'}\n\nVisible text: ${s.text.slice(0, 2200)}${img ? '\n\n(Screenshot attached.)' : ''}`;
  return { text, img, touched };
}

async function moveClick(a, x, y, label, n = 1) {
  a.cur = { x: x / a.vw, y: y / a.vh, label };
  await ev(a, `__ywAg.cur(${x},${y},${JSON.stringify(a.name)},${JSON.stringify(a.color)},${JSON.stringify(label)},true)`);
  draw();
  await sleep(330);
  x = Math.round(x); y = Math.round(y);
  await cdp(a, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (let i = 1; i <= n; i++) {
    await cdp(a, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: i });
    await cdp(a, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: i });
  }
}

const KEYS = { enter: ['Enter', 'Enter', 13, '\r'], tab: ['Tab', 'Tab', 9], escape: ['Escape', 'Escape', 27], esc: ['Escape', 'Escape', 27], backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], up: ['ArrowUp', 'ArrowUp', 38], arrowup: ['ArrowUp', 'ArrowUp', 38], down: ['ArrowDown', 'ArrowDown', 40], arrowdown: ['ArrowDown', 'ArrowDown', 40], left: ['ArrowLeft', 'ArrowLeft', 37], arrowleft: ['ArrowLeft', 'ArrowLeft', 37], right: ['ArrowRight', 'ArrowRight', 39], arrowright: ['ArrowRight', 'ArrowRight', 39], home: ['Home', 'Home', 36], end: ['End', 'End', 35], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34], space: [' ', 'Space', 32, ' '] };
const MODS = { alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, win: 4, shift: 8 };
async function pressKeys(a, combo) {
  const parts = String(combo).split('+').map(s => s.trim().toLowerCase()).filter(Boolean);
  let mod = 0;
  for (const p of parts) if (p in MODS) mod |= MODS[p];
  for (const k of parts.filter(p => !(p in MODS))) {
    let d = KEYS[k];
    if (!d && k.length === 1) {
      const up = k.toUpperCase(), plain = !(mod & 7);
      d = [mod & 8 ? up : k, /[a-z]/.test(k) ? 'Key' + up : /\d/.test(k) ? 'Digit' + k : '', up.charCodeAt(0), plain ? (mod & 8 ? up : k) : undefined];
    }
    if (!d && /^f([1-9]|1[0-2])$/.test(k)) d = [k.toUpperCase(), k.toUpperCase(), 111 + +k.slice(1)];
    if (!d) throw new Error('Unknown key: ' + k);
    const [key, code, vk, text] = d;
    await cdp(a, 'Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod, text, unmodifiedText: text });
    await cdp(a, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mod });
  }
}

// Things that need the user's OK (unless auto mode), by what the clicked thing says.
const RISK = [
  ['pay', /\b(pay|buy|purchase|place (your )?order|checkout|check out|complete (the )?(order|purchase|booking)|book now|subscribe|donate|add (a )?card)\b|оплат|купить|оформить|заказать/i, 'pay'],
  ['send', /\b(send|post|publish|tweet|reply|submit|comment)\b|отправ|опубликов/i, 'send'],
  ['signin', /\b(sign ?in|log ?in)\b|войти|вход/i, 'sign in with'],
  ['delete', /\b(delete|remove|erase|trash|uninstall)\b|удал/i, 'delete'],
  ['install', /\b(install|setup)\b|установ/i, 'install'],
  ['download', /\bdownload\b|скачать/i, 'download'],
];
function risky(label, flagged, pw) {
  if (S.auto) return null;
  for (const [k, re, verb] of RISK) if (S.ask[k] && re.test(label || '')) return verb;
  if (pw && S.ask.signin) return 'sign in with';
  return flagged ? 'do' : null;
}
async function gate(a, label, flagged, pw, what) {
  const verb = risky(label, flagged, pw);
  if (!verb) return null;
  const ok = await approve(a, `Wants to ${what || 'click'} “${(label || 'something').slice(0, 70)}”${verb !== 'do' && what !== 'type into' ? '' : ''}`);
  return ok ? null : { error: 'The user said no to this action. Don\'t retry it; find another way or ask_user.' };
}

function settle(a) { a.lastAct = Date.now(); return sleep(700); }
const normUrl = u => { u = String(u || '').trim(); if (!u) return ''; if (/^[a-z][\w+.-]*:/i.test(u)) return /^https?:/i.test(u) ? u : ''; return 'https://' + u; };
function homeUrl() {
  const e = store('yw-search', 'yuki');
  return { google: 'https://www.google.com', yandex: 'https://yandex.ru', bing: 'https://www.bing.com', ddg: 'https://duckduckgo.com' }[e] || 'https://search.yukichat.lol';
}

async function act(a, c) {
  const g = c.args || {};
  const say = s => { a.status = s; a.log.push(s); if (a.log.length > 200) a.log.shift(); draw(); };
  if (c.name === 'look') { a.wantLook = true; say('Looking at the screen'); return { ok: true }; }
  if (c.name === 'wait') { say('Waiting'); await sleep(Math.min(10, Math.max(0.5, +g.seconds || 2)) * 1000); return { ok: true }; }
  if (c.name === 'report') { chat('ag', String(g.text || ''), a); a.lastReport = g.text; return { ok: true }; }
  if (c.name === 'ask_user') { const ans = await ask(a, String(g.question || '')); return { answer: ans || '(no answer)' }; }
  if (c.name === 'done') { finish(a, g.success !== false, String(g.result || '')); return { ok: true }; }
  return a.kind === 'desk' ? actDesk(a, c, g, say) : actTab(a, c, g, say);
}

async function actTab(a, c, g, say) {
  if (c.name === 'click') {
    const r = await ev(a, `__ywAg.rect(${+g.ref})`);
    if (!r) { a.lastFail = true; return { error: 'No element with that ref now. The page may have changed: look again.' }; }
    const no = await gate(a, r.label, g.sensitive, false);
    if (no) return no;
    say(`Click “${r.label.slice(0, 40)}”`);
    await moveClick(a, r.x, r.y, 'clicking');
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'click_at') {
    const x = (+g.x / 1000) * a.vw, y = (+g.y / 1000) * a.vh;
    const label = await ev(a, `__ywAg.at(${x},${y})`);
    const no = await gate(a, label, g.sensitive, false);
    if (no) return no;
    say(`Click at ${Math.round(g.x)},${Math.round(g.y)}${label ? ` (“${String(label).slice(0, 30)}”)` : ''}`);
    await moveClick(a, x, y, 'clicking', g.double ? 2 : 1);
    await settle(a);
    return { ok: true, clicked: label || null };
  }
  if (c.name === 'type') {
    const text = String(g.text ?? '');
    if (g.ref != null) {
      const r = await ev(a, `__ywAg.rect(${+g.ref})`);
      if (!r) { a.lastFail = true; return { error: 'No element with that ref now: look again.' }; }
      const no = await gate(a, r.label, g.sensitive, r.pw, 'type into');
      if (no) return no;
      await moveClick(a, r.x, r.y, 'typing');
      await ev(a, `__ywAg.focus(${+g.ref},${!!g.clear})`);
    } else if (g.sensitive) {
      const no = await gate(a, 'this field', true, false, 'type into');
      if (no) return no;
    }
    say(`Type “${text.slice(0, 40)}”`);
    await cdp(a, 'Input.insertText', { text });
    if (g.enter) await pressKeys(a, 'enter');
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'select') { say(`Choose “${g.option}”`); const r = await ev(a, `__ywAg.select(${+g.ref},${JSON.stringify(String(g.option || ''))})`); await settle(a); return r || { error: 'failed' }; }
  if (c.name === 'key') { say(`Press ${g.keys}`); await pressKeys(a, g.keys); await settle(a); return { ok: true }; }
  if (c.name === 'scroll') {
    const d = (g.direction === 'up' ? -1 : 1) * Math.max(0.2, Math.min(10, +g.amount || 1)) * a.vh * 0.8;
    say(`Scroll ${g.direction}`);
    await cdp(a, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(a.vw / 2), y: Math.round(a.vh / 2), deltaX: 0, deltaY: Math.round(d) });
    await sleep(400); a.lastAct = Date.now();
    return { ok: true };
  }
  if (c.name === 'navigate') {
    const u = normUrl(g.url);
    if (!u) return { error: 'Only http(s) addresses' };
    say('Open ' + u.replace(/^https?:\/\//, '').slice(0, 50));
    await invoke('tab_nav', { id: a.tab, url: u });
    await sleep(1200); a.lastAct = Date.now();
    return { ok: true };
  }
  if (c.name === 'back') { say('Go back'); await invoke('tab_cmd', { id: a.tab, cmd: 'back' }); await sleep(1200); a.lastAct = Date.now(); return { ok: true }; }
  return { error: 'Unknown action ' + c.name };
}

// ---------- Desktop agent ----------
let screen = { w: 1920, h: 1080 };
async function observeDesk(a) {
  const wins = await invoke('desk_windows').catch(() => []);
  const tree = await invoke('desk_tree').catch(e => ({ window: '', items: [], error: String(e) }));
  a.tree = tree.items || [];
  const look = a.wantLook || !S.text || a.tree.length < 4 || a.step % 4 === 0 || a.lastFail;
  a.wantLook = false; a.lastFail = false;
  let img = null;
  if (look) {
    const [b64, w, h] = await invoke('desk_shot', { width: 1280, quality: 60 });
    img = b64; screen = { w, h };
  }
  const els = a.tree.map(e => `[${e.i}] ${e.t} "${e.n}"${e.v ? ` value="${e.v}"` : ''}${e.off ? ' disabled' : ''}`).join('\n');
  const text = `Step ${a.step + 1}. Screen ${screen.w}x${screen.h}.\nWindows: ${wins.map(w => (w.front ? '[front] ' : '') + w.title + (w.min ? ' (minimized)' : '')).join(' | ') || '(none)'}\n` +
    `Front window: ${tree.window || '(desktop)'}\nElements:\n${els || '(none: call look)'}${tree.error ? '\n(UI Automation: ' + tree.error + ')' : ''}${img ? '\n\n(Screenshot attached.)' : ''}`;
  return { text, img };
}

async function deskCursor(a, x, y, label, click) {
  a.cur = { x: x / screen.w, y: y / screen.h, label };
  draw();
  await invoke('desk_cursor', { show: true, x: Math.round(x), y: Math.round(y), name: a.name, color: a.color, label, click: !!click });
}
const P = (vx, vy) => [Math.round((+vx / 1000) * screen.w), Math.round((+vy / 1000) * screen.h)];

async function actDesk(a, c, g, say) {
  const el = g.ref != null ? (a.tree || []).find(e => e.i === +g.ref) : null;
  const center = e => [(e.r[0] + e.r[2]) / 2, (e.r[1] + e.r[3]) / 2];
  if (c.name === 'click') {
    if (!el) { a.lastFail = true; return { error: 'No element with that ref: look again.' }; }
    const no = await gate(a, el.n, g.sensitive, false);
    if (no) return no;
    say(`Click “${el.n.slice(0, 40)}”`);
    const [x, y] = center(el);
    await deskCursor(a, x, y, 'clicking', true);
    const r = await invoke('desk_act', { index: +g.ref, kind: 'click' }).catch(() => ({ ok: false }));
    if (!r.ok) await invoke('desk_input', { kind: 'click', x: Math.round(x), y: Math.round(y) });
    await settle(a);
    return { ok: true, how: r.ok ? 'in the background' : 'with the mouse' };
  }
  if (c.name === 'click_at') {
    const no = await gate(a, '', g.sensitive, false);
    if (no) return no;
    const [x, y] = P(g.x, g.y);
    say(`Click at ${Math.round(g.x)},${Math.round(g.y)}`);
    await deskCursor(a, x, y, 'clicking', true);
    await invoke('desk_input', { kind: g.button === 'right' ? 'right' : g.button === 'double' ? 'double' : 'click', x, y });
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'type') {
    const text = String(g.text ?? '');
    if (g.sensitive) { const no = await gate(a, el?.n || 'a field', true, false, 'type into'); if (no) return no; }
    say(`Type “${text.slice(0, 40)}”`);
    let done = false;
    if (el) {
      const [x, y] = center(el);
      await deskCursor(a, x, y, 'typing', false);
      const r = await invoke('desk_act', { index: +g.ref, kind: 'type', text }).catch(() => ({ ok: false }));
      done = !!r.ok;
      if (!done) await invoke('desk_input', { kind: 'click', x: Math.round(x), y: Math.round(y) });
    }
    if (!done) await invoke('desk_input', { kind: 'type', x: 0, y: 0, text });
    if (g.enter) await invoke('desk_input', { kind: 'keys', x: 0, y: 0, text: 'enter' });
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'key') {
    if (/\b(delete|del)\b/i.test(g.keys) && !S.auto && S.ask.delete) { const no = await gate(a, 'delete', true, false, 'press'); if (no) return no; }
    say(`Press ${g.keys}`); await invoke('desk_input', { kind: 'keys', x: 0, y: 0, text: String(g.keys) }); await settle(a); return { ok: true };
  }
  if (c.name === 'scroll') {
    const [x, y] = g.x != null ? P(g.x, g.y ?? 500) : [screen.w / 2, screen.h / 2];
    say(`Scroll ${g.direction}`);
    await deskCursor(a, x, y, 'scrolling', false);
    await invoke('desk_input', { kind: 'scroll', x: Math.round(x), y: Math.round(y), amount: (g.direction === 'up' ? -1 : 1) * Math.max(1, Math.min(20, +g.amount || 3)) });
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'drag') {
    const [x, y] = P(g.x, g.y), [x2, y2] = P(g.x2, g.y2);
    say('Drag');
    await deskCursor(a, x, y, 'dragging', false);
    await invoke('desk_input', { kind: 'drag', x, y, x2, y2 });
    await deskCursor(a, x2, y2, 'dragging', false);
    await settle(a);
    return { ok: true };
  }
  if (c.name === 'open_app') {
    const no = /\.(exe|msi|bat|cmd|ps1)$/i.test(g.name) ? await gate(a, 'install ' + g.name, true, false, 'run') : null;
    if (no) return no;
    say('Open ' + g.name);
    await invoke('desk_open', { target: String(g.name) });
    await sleep(2500); a.lastAct = Date.now();
    return { ok: true };
  }
  if (c.name === 'focus_window') { say('Switch to ' + g.title); const ok = await invoke('desk_focus', { title: String(g.title) }); return ok ? { ok: true } : { error: 'No window with that title' }; }
  return { error: 'Unknown action ' + c.name };
}

// ---------- Remembered routes ----------
const hostOf = u => { try { return new URL(normUrl(u)).host.replace(/^www\./, '') } catch { return '' } };
function remember(a) {
  const h = hostOf(a.startUrl || a.url);
  if (!h || a.kind === 'desk' || !a.log.length) return;
  const all = store('yw-agents-routes', {});
  all[h] = [{ task: a.task.slice(0, 160), steps: a.log.slice(-25) }, ...(all[h] || [])].slice(0, 3);
  try { localStorage.setItem('yw-agents-routes', JSON.stringify(all)) } catch {}
}
function tipsFor(u) {
  if (!S.routes) return '';
  const h = hostOf(u), r = h && store('yw-agents-routes', {})[h];
  return r ? r.map(x => `- Task "${x.task}": ${x.steps.join(' → ')}`).join('\n') : '';
}

// ---------- Live previews ----------
let sheetFor = null; // the agent whose detail sheet is open
setInterval(async () => {
  if (document.hidden) return;
  for (const a of agents) {
    if (a.stopped || a.thumbBusy || (a.finished && a.thumb) || (a.kind !== 'desk' && a.tab == null)) continue;
    // A full-screen grab is heavier than a tab shot: refresh it fast only while its sheet is open.
    if (a.kind === 'desk' && a.name !== sheetFor && a.thumb && Date.now() - (a.thumbAt || 0) < 6000) continue;
    a.thumbBusy = true;
    try {
      a.thumb = a.kind === 'desk'
        ? (await invoke('desk_shot', { width: 640, quality: 55 }))[0]
        : (await cdp(a, 'Page.captureScreenshot', { format: 'jpeg', quality: 40 })).data;
      a.thumbAt = Date.now();
      document.querySelectorAll(`[data-n="${a.name}"] .shot img`).forEach(i => { i.src = 'data:image/jpeg;base64,' + a.thumb; });
      draw();
    } catch {}
    a.thumbBusy = false;
  }
}, 1600);

// ---------- UI ----------
const short = m => mname(m).replace(/^Gemini /, '');
const avStyle = c => `background:linear-gradient(140deg,${c},color-mix(in oklab,${c} 55%,#fff))`;
const avatar = a => `<span class="av" style="${avStyle(a.color)}" aria-hidden="true">${esc(a.name[0])}</span>`;
const WHERE = a => a.kind === 'desk' ? [IC.monitor, 'Desktop'] : a.kind === 'mine' ? [IC.cursor, 'Your tab'] : [IC.globe, 'Tab'];

function post(d) {
  const m = $('#msgs'), near = m.scrollHeight - m.scrollTop - m.clientHeight < 80;
  const t = $('#typing');
  t ? m.insertBefore(d, t) : m.append(d);
  draw();
  requestAnimationFrame(() => { if (near) m.scrollTop = 1e9; });
}
function chat(who, text, a) {
  if (!text) return;
  const d = document.createElement('div');
  d.className = 'm ' + who;
  if (who === 'lead' || who === 'ag') {
    d.innerHTML = (who === 'lead' ? `<span class="lav" aria-hidden="true">${IC.spark}</span>` : avatar(a)) + `<div class="body sf"><span class="nm">${who === 'lead' ? 'Lead' : esc(a.name)}</span></div>`;
    d.querySelector('.body').append(document.createTextNode(text));
  } else d.textContent = text;
  post(d);
}
function confirmChat(text) {
  return new Promise(res => {
    const d = document.createElement('div');
    d.className = 'm confirm';
    d.innerHTML = `<span>${esc(text)}</span><div class="acts"><button class="btn pri">Allow</button><button class="btn">Not now</button></div>`;
    const [yes, no] = d.querySelectorAll('button');
    const end = v => { d.querySelector('.acts').remove(); d.append(v ? ' Allowed.' : ' Not allowed.'); res(v); };
    yes.onclick = () => end(true); no.onclick = () => end(false);
    post(d);
    yes.focus();
  });
}
let thinkingOn = false;
function thinking(on) {
  thinkingOn = on;
  let t = $('#typing');
  if (on && !t) { t = document.createElement('div'); t.id = 'typing'; t.className = 'typing'; t.innerHTML = `<span class="lav" aria-hidden="true">${IC.spark}</span>` + 'Thinking…'; $('#msgs').append(t); $('#msgs').scrollTop = 1e9; }
  else if (!on && t) t.remove();
  draw();
}

function badge() {
  emitTo('ui', 'agents-badge', agents.filter(a => a.hold && !a.stopped).length);
}

const rank = a => a.hold && !a.stopped ? 0 : !a.finished && !a.stopped ? 1 : 2;
function stateOf(a) {
  if (a.stopped) return ['bad', 'Stopped'];
  if (a.finished) return a.status === 'Done' ? ['ok', 'Done'] : ['bad', a.status];
  if (a.hold) return ['need', a.hold.kind === 'takeover' ? 'You have control' : a.hold.kind === 'budget' ? 'Out of budget' : 'Needs you'];
  if (a.paused) return ['', 'Paused'];
  return ['run', a.status || 'Working'];
}

let queued = false, lastOrder = '';
function draw() { if (!queued) { queued = true; requestAnimationFrame(paint); } }
function paint() {
  queued = false;
  const working = live().length, need = agents.filter(a => a.hold && !a.stopped).length;
  $('#count').textContent = agents.length ? [working ? `${working} working` : 'All done', need ? `${need} waiting for you` : ''].filter(Boolean).join(' · ') : 'Helpers for the web and your PC';
  $('#mdl').innerHTML = esc(short(S.worker)) + IC.chev;
  $('#meter').hidden = !KEY || (!agents.length && !spent);
  $('#spend').innerHTML = `<b>${money(spent)}</b> of ${money(S.budget)}${toks ? ` · ${ktok(toks)} tokens` : ''}`;
  const f = Math.min(1, spent / (S.budget || 1));
  $('#mbar').style.transform = `scaleX(${f})`;
  $('#mbar').classList.toggle('hot', f >= 0.8);
  $('#pause').textContent = pausedAll ? 'Resume all' : 'Pause all';
  $('#pause').hidden = !working;

  // Cards: waiting for you first, then working, then finished. Reorder only when it changes.
  const list = $('#list'), order = [...agents].sort((x, y) => rank(x) - rank(y) || agents.indexOf(x) - agents.indexOf(y));
  const keep = new Set(agents.map(a => a.name));
  for (const el of [...list.children]) if (!keep.has(el.dataset.n)) el.remove();
  for (const a of order) {
    let li = list.querySelector(`.ag[data-n="${a.name}"]`);
    if (!li) { li = card(a); list.append(li); }
    fill(li, a);
  }
  const key = order.map(a => a.name).join();
  if (key !== lastOrder) { lastOrder = key; for (const a of order) list.append(list.querySelector(`.ag[data-n="${a.name}"]`)); }
  $('#striph').hidden = !agents.length;

  // Empty and setup states.
  const empty = $('#empty'), quiet = !agents.length && !$('#msgs .m');
  empty.hidden = KEY ? !quiet : false;
  if (!KEY) {
    if (empty.dataset.v !== 'key') {
      empty.dataset.v = 'key';
      empty.innerHTML = `<h2>Meet your agents</h2><p>They work in their own tabs and in Windows apps while you keep browsing. Add a Gemini key to start: Google bills you directly, usually a few cents per task.</p><button class="btn pri" id="setup">Add Gemini key</button>`;
      $('#setup').onclick = () => settingsView(true);
    }
  } else if (quiet && empty.dataset.v !== 'ex') {
    empty.dataset.v = 'ex';
    const ex = [
      [IC.plane, '#1864AB', 'Find 3 flights from Berlin to Lisbon under €200 in December and compare them'],
      [IC.note, '#2B8A3E', 'Open Notepad and write a packing list for a weekend in the mountains'],
      [IC.tag, '#C2410C', 'Compare the price of a PlayStation 5 on three big online shops'],
    ];
    empty.innerHTML = `<h2>What can I do for you?</h2><p>Describe a task. I'll split it up and send agents off in parallel, each with its own tab and cursor.</p>`
      + `<div class="sugs">${ex.map(([ic, c, t]) => `<button class="sug sf" data-t="${esc(t)}"><span class="ic" style="${avStyle(c)}">${ic}</span><span>${esc(t)}</span></button>`).join('')}</div>`;
    empty.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { $('#q').value = b.dataset.t; grow(); $('#q').focus(); });
  }
  $('#msgs').hidden = !$('#msgs').children.length;
  // The ASCII ring belongs to the welcome screen only, right above its heading.
  const ring = $('#ascii');
  if (ring.parentNode !== empty) empty.prepend(ring);
  else if (empty.firstChild !== ring) empty.prepend(ring);
  ring.hidden = !quiet || !$('#set').hidden;

  const chips = live().map(a => `<button class="chip sf" data-a="${esc(a.name)}">${avatar(a)}@${esc(a.name)}</button>`).join('')
    + (agents.some(a => a.finished || a.stopped) && !lead.busy ? '<button class="chip sf plain" data-clear>Clear finished</button>' : '');
  if ($('#chips').dataset.h !== chips) {
    $('#chips').dataset.h = chips;
    $('#chips').innerHTML = chips;
    $('#chips').querySelectorAll('[data-a]').forEach(b => b.onclick = () => { $('#q').value = '@' + b.dataset.a + ' ' + $('#q').value.replace(/^@\w+\s*/, ''); $('#q').focus(); grow(); });
    $('#chips').querySelector('[data-clear]')?.addEventListener('click', clearFinished);
  }
  $('#q').disabled = !KEY;
  $('#send').disabled = !KEY;
  if (sheetFor) paintSheet();
}

function card(a) {
  const li = document.createElement('li');
  li.className = 'ag sf';
  li.dataset.n = a.name;
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${a.name}: open details`);
  const [ic, where] = WHERE(a);
  li.innerHTML = `<div class="shot"><img alt=""><div class="ph">Starting</div><span class="badge">${ic}${where}</span><div class="cur" hidden>${ARROW(a.color)}<span style="background:${a.color}"></span></div></div>`
    + `<div class="who2">${avatar(a)}<b>${esc(a.name)}</b><span class="cost num"></span></div>`
    + `<div class="task"></div><div class="st"></div><div class="ask" hidden></div>`;
  li.onclick = e => { if (!e.target.closest('.ask')) openSheet(a); };
  li.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); openSheet(a); } };
  // Tilt toward the pointer.
  li.onpointermove = e => {
    const r = li.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    li.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
    li.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
  };
  li.onpointerleave = () => { li.style.removeProperty('--rx'); li.style.removeProperty('--ry'); };
  if (a.thumb) li.querySelector('img').src = 'data:image/jpeg;base64,' + a.thumb;
  return li;
}

function holdBox(box, a) {
  const h = !a.stopped && a.hold;
  box.hidden = !h;
  if (!h || box.dataset.h === h.kind + h.text) return;
  box.dataset.h = h.kind + h.text;
  if (h.kind === 'approve') box.innerHTML = `<p>${esc(h.text)}</p><div class="acts"><button class="btn pri" data-v="1">Allow once</button><button class="btn" data-v="0">Deny</button></div>`;
  else if (h.kind === 'ask') box.innerHTML = `<p>${esc(h.text)}</p><div class="acts"><input aria-label="Your answer to ${esc(a.name)}" placeholder="Your answer"><button class="btn pri">Send</button></div>`;
  else if (h.kind === 'takeover') box.innerHTML = `<p>You took over. ${esc(a.name)} waits until you hand back.</p><div class="acts"><button class="btn pri">Hand back</button></div>`;
  else box.innerHTML = `<p>${esc(h.text)}.</p><div class="acts"><button class="btn pri" data-v="1">Allow $0.50 more</button><button class="btn" data-v="0">Stop</button></div>`;
  box.querySelectorAll('button').forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (h.kind === 'approve') { a.approved = b.dataset.v === '1'; unhold(a); }
    else if (h.kind === 'ask') { const i = box.querySelector('input'); a.answer = i.value.trim(); if (!a.answer) return i.focus(); chat('you', `@${a.name} ${a.answer}`); unhold(a); }
    else if (h.kind === 'takeover') { if (a.kind === 'desk') invoke('desk_reset'); a.inbox.push('The user did something themselves; check the current state.'); a.wantLook = true; a.lastAct = Date.now(); unhold(a); }
    else if (b.dataset.v === '1') { a.limit = a.cost + 0.5; if (spent >= S.budget) { S.budget = +(spent + 0.5).toFixed(2); saveS(); } unhold(a); }
    else stop(a);
  });
  const inp = box.querySelector('input');
  if (inp) inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') box.querySelector('button').click(); };
}

function shotFill(shot, a) {
  const done = a.finished || a.stopped;
  shot.querySelector('.ph').hidden = !!a.thumb;
  shot.querySelector('.ph').textContent = done ? 'No preview' : 'Starting';
  const cur = shot.querySelector('.cur');
  cur.hidden = !(a.kind === 'desk' && a.cur) || done;
  if (!cur.hidden) {
    cur.style.transform = `translate(${Math.round(a.cur.x * shot.clientWidth)}px,${Math.round(a.cur.y * shot.clientHeight)}px)`;
    cur.querySelector('span').textContent = a.cur.label || a.name;
  }
}

function fill(li, a) {
  li.classList.toggle('need', !!a.hold && !a.stopped);
  li.querySelector('.cost').textContent = money(a.cost);
  li.querySelector('.cost').title = `${(a.tok || 0).toLocaleString()} tokens`;
  li.querySelector('.task').textContent = a.task;
  li.querySelector('.task').title = a.task;
  const [cls, txt] = stateOf(a), st = li.querySelector('.st');
  st.className = 'st ' + cls;
  st.innerHTML = `<span class="pd" aria-hidden="true"></span>${esc(txt)}`;
  st.title = txt;
  shotFill(li.querySelector('.shot'), a);
  holdBox(li.querySelector('.ask'), a);
}

// Detail sheet: big live view, result, controls, steps.
function openSheet(a) {
  sheetFor = a.name;
  const s = $('#sheet');
  s.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="hd">${avatar(a)}<div class="grow"><b>${esc(a.name)}</b><span class="sub"></span></div><button class="rb sf" id="shx" aria-label="Close">${IC.x}</button></div>`
    + `<div class="shot"><img alt="Live view of ${esc(a.name)}"><div class="ph">Starting</div><div class="cur" hidden>${ARROW(a.color)}<span style="background:${a.color}"></span></div></div>`
    + `<div class="ask" hidden></div><div class="result" hidden></div>`
    + `<div class="acts2"><button class="btn" data-k="show">${IC.open}Open tab</button><button class="btn" data-k="pause"></button><button class="btn" data-k="stop">${IC.stop}Stop</button></div>`
    + `<div class="steps-h" hidden>Steps</div><ol class="steps"></ol>`;
  if (a.thumb) s.querySelector('img').src = 'data:image/jpeg;base64,' + a.thumb;
  s.querySelector('#shx').onclick = closeSheet;
  s.querySelector('[data-k=show]').onclick = () => invoke('agent_show', { id: a.tab });
  s.querySelector('[data-k=pause]').onclick = () => { a.paused = !a.paused; if (!a.paused) wake(a); draw(); };
  s.querySelector('[data-k=stop]').onclick = () => stop(a);
  s.dataset.n = a.name;
  $('#scrim').hidden = s.hidden = false;
  paintSheet();
  s.querySelector('#shx').focus();
}
function closeSheet() { sheetFor = null; $('#sheet').hidden = $('#scrim').hidden = true; }
$('#scrim').onclick = closeSheet;
function paintSheet() {
  const a = A(sheetFor), s = $('#sheet');
  if (!a) return closeSheet();
  const [cls, txt] = stateOf(a), [, where] = WHERE(a), done = a.finished || a.stopped;
  s.querySelector('.sub').textContent = `${where} · ${txt}${a.step ? ' · step ' + a.step : ''} · ${money(a.cost)}${a.tok ? ' · ' + ktok(a.tok) + ' tokens' : ''}`;
  shotFill(s.querySelector('.shot'), a);
  holdBox(s.querySelector('.ask'), a);
  const res = s.querySelector('.result');
  res.hidden = !(a.finished && a.result);
  res.textContent = a.result || '';
  s.querySelector('[data-k=show]').hidden = a.kind === 'desk' || a.tab == null;
  const pb = s.querySelector('[data-k=pause]');
  pb.innerHTML = (a.paused ? IC.play + 'Resume' : IC.pause + 'Pause');
  pb.hidden = s.querySelector('[data-k=stop]').hidden = done;
  s.querySelector('.steps-h').hidden = !a.log.length;
  const from = a.step - Math.min(a.log.length, 60);
  const html = a.log.slice(-60).map((x, i) => `<li><i class="num">${from + i + 1}</i><span>${esc(x)}</span></li>`).reverse().join('');
  const ol = s.querySelector('.steps');
  if (ol.dataset.h !== html) { ol.dataset.h = html; ol.innerHTML = html; }
  void cls;
}

function clearFinished() {
  for (let i = agents.length - 1; i >= 0; i--) if (agents[i].finished || agents[i].stopped) agents.splice(i, 1);
  if (!agents.length && !lead.busy) { lead.hist = []; lead.pending = []; $('#msgs').innerHTML = ''; spent = 0; }
  if (sheetFor && !A(sheetFor)) closeSheet();
  draw();
}

// ---------- Composer ----------
let mine = false;
const grow = () => { const q = $('#q'); q.style.height = '44px'; q.style.height = Math.min(150, Math.max(44, q.scrollHeight)) + 'px'; };
$('#q').oninput = grow;
$('#q').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
$('#send').innerHTML = IC.up;
$('#send').onclick = send;
const PH = 'What should the agents do?';
$('#mine').onclick = () => { mine = !mine; $('#mine').setAttribute('aria-pressed', mine); $('#q').placeholder = mine ? 'What should an agent do on this page?' : PH; $('#q').focus(); };
async function send() {
  const text = $('#q').value.trim();
  if (!text || !KEY) return;
  $('#q').value = ''; grow();
  const m = text.match(/^@(\w+)\s+([\s\S]+)/);
  const target = m && A(m[1]);
  chat('you', text);
  if (target) { message(target, m[2]); return; }
  if (mine) {
    mine = false; $('#mine').setAttribute('aria-pressed', false); $('#q').placeholder = PH;
    const a = newAgent('mine', text, null, null);
    a.tab = await invoke('agent_active');
    start(a);
    return;
  }
  leadEvent('User: ' + text);
}

// ---------- Header ----------
$('#gear').innerHTML = IC.gear;
$('#close').innerHTML = IC.x;
$('#close').onclick = () => invoke('agents_open', { open: false });
$('#gear').onclick = () => settingsView($('#set').hidden);
$('#pause').onclick = () => {
  pausedAll = !pausedAll;
  for (const a of agents) { a.paused = pausedAll; if (!pausedAll) wake(a); }
  draw();
};
$('#grip').onpointerdown = e => {
  const g = $('#grip'), x0 = e.screenX, w0 = innerWidth;
  g.setPointerCapture(e.pointerId); g.classList.add('on');
  g.onpointermove = m => invoke('agents_resize', { size: w0 + (x0 - m.screenX) });
  g.onpointerup = () => { g.onpointermove = null; g.classList.remove('on'); };
};
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#mpop').hidden) { $('#mpop').hidden = true; $('#mdl').focus(); }
  else if (sheetFor) closeSheet();
  else if (!$('#set').hidden) settingsView(false);
});

// Model menu (header pill).
const THINK = { low: 'Low', medium: 'Medium', high: 'High', off: 'Off' };
const thinkOpts = cur => Object.entries(THINK).map(([k, n]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${n}</option>`).join('');
function modelOpts(cur) {
  return modelIds().map(id => { const p = MODELS[id] && MODELS[id][1](); return `<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(mname(id))}${p ? ` · $${p[0]} / $${p[1]}` : ''}</option>`; }).join('');
}
$('#mdl').onclick = e => {
  e.stopPropagation();
  const m = $('#mpop');
  if (!m.hidden) { m.hidden = true; return; }
  m.innerHTML = `<label for="pw">Workers</label><div class="two"><select id="pw">${modelOpts(S.worker)}</select><select id="pwt" aria-label="Worker thinking level" title="How hard the model thinks per step">${thinkOpts(S.workerThink)}</select></div>`
    + `<label for="pl">Lead</label><div class="two"><select id="pl">${modelOpts(S.lead)}</select><select id="plt" aria-label="Lead thinking level" title="How hard the model thinks per step">${thinkOpts(S.leadThink)}</select></div>`
    + `<p>Prices per 1M tokens, input / output. <button class="lk" id="pref">Refresh list</button></p>`;
  m.hidden = false;
  m.onclick = ev => ev.stopPropagation();
  const bind = (id, k) => { m.querySelector(id).onchange = ev => { S[k] = ev.target.value; saveS(); draw(); }; };
  bind('#pw', 'worker'); bind('#pwt', 'workerThink'); bind('#pl', 'lead'); bind('#plt', 'leadThink');
  m.querySelector('#pref').onclick = async ev => { ev.target.textContent = 'Loading…'; await fetchModels(); m.hidden = true; $('#mdl').click(); };
  m.querySelector('#pw').focus();
};
addEventListener('click', () => { $('#mpop').hidden = true; });

// ---------- Settings ----------
function settingsView(on) {
  $('#set').hidden = !on;
  $('#home').hidden = $('#comp').hidden = on;
  $('#gear').setAttribute('aria-pressed', on);
  $('#mpop').hidden = true;
  closeSheet();
  draw();
  if (on) { paintSettings(); $('#sback').focus(); }
}
function paintSettings() {
  const sw = (title, sub, attr, on) => `<label class="sw"><div><b>${title}</b><small>${sub}</small></div><button class="tg" role="switch" aria-checked="${!!on}" ${attr} aria-label="${esc(title)}"></button></label>`;
  const total = +(localStorage.getItem('yw-agents-total') || 0), ttok = +(localStorage.getItem('yw-agents-tokens') || 0);
  const custom = !(MODELS[S.lead] && MODELS[S.worker]);
  $('#set').innerHTML = `
  <div class="shead"><button class="rb sf" id="sback" aria-label="Back to agents">${IC.back}</button><h2>Settings</h2></div>
  <section class="sf"><h3>Gemini API key</h3><p>Stored encrypted for your Windows account and only ever sent to Google.</p>
    <div class="fld"><label for="key">Key</label><div class="keyrow"><input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="AIza…" value="${esc(KEY)}"><button class="btn pri" id="ktest">Save</button></div></div>
    <p class="note" id="knote">${KEY ? 'A key is saved and working.' : 'No key yet? <a href="#" id="kget">Get one at aistudio.google.com</a>, it takes a minute.'}</p>
  </section>
  <section class="sf"><h3>Models</h3><p>The lead plans and makes few calls, so a smarter model costs little there. Workers click and type all the time, so a fast model keeps the bill low.</p>
    <div class="fld"><label for="mlead">Lead</label><div class="two"><select id="mlead">${modelOpts(S.lead)}</select><select id="tlead" aria-label="Lead thinking level">${thinkOpts(S.leadThink)}</select></div></div>
    <div class="fld"><label for="mwork">Workers</label><div class="two"><select id="mwork">${modelOpts(S.worker)}</select><select id="twork" aria-label="Worker thinking level">${thinkOpts(S.workerThink)}</select></div></div>
    <div class="fld" id="custom" ${custom ? '' : 'hidden'}><label for="cin">Price of other models, $ per 1M tokens (input, output)</label><div class="two" style="grid-template-columns:1fr 1fr"><input id="cin" class="num" inputmode="decimal" value="${S.customIn}"><input id="cout" class="num" inputmode="decimal" aria-label="Output price" value="${S.customOut}"></div></div>
  </section>
  <section class="sf"><h3>Budget</h3><p>Agents pause when a limit is reached, nothing keeps spending in the background. This session ${money(spent)} (${ktok(toks)} tokens), all time ${money(total)} (${ktok(ttok)} tokens).</p>
    <div class="grid3">
      <div class="fld"><label for="bs">Per session, $</label><input id="bs" class="num" inputmode="decimal" value="${S.budget}"></div>
      <div class="fld"><label for="ba">Per agent, $</label><input id="ba" class="num" inputmode="decimal" value="${S.perAgent}"></div>
      <div class="fld"><label for="bm">At once</label><input id="bm" class="num" inputmode="numeric" value="${S.max}"></div>
    </div>
  </section>
  <section class="sf"><h3>Access</h3><p>What agents are allowed to use.</p>
    ${sw('Windows apps', 'Excel, Notepad and other apps. In the background when the app allows it, otherwise with your mouse. Move the mouse to take over.', 'data-s="desktop"', S.desktop)}
    ${sw('Use my logins', 'Agent tabs share your cookies and stay signed in. Off gives each agent a clean private tab.', 'data-s="logins"', S.logins)}
    ${sw('Auto mode', 'Agents never stop to ask, not even before paying or working in your tab. Only for tasks you trust.', 'data-s="auto"', S.auto)}
  </section>
  <section class="sf"><h3>Ask before</h3><p>${S.auto ? 'Auto mode is on, so agents skip these questions.' : 'Agents stop and wait for your OK before these.'}</p>
    ${[['pay', 'Paying', 'Buy, order, subscribe, donate'], ['send', 'Sending or posting', 'Messages, comments, forms that publish'], ['signin', 'Signing in', 'Log in buttons and password fields'], ['delete', 'Deleting', 'Delete, remove, uninstall'], ['install', 'Installing', 'Setup files and installers'], ['download', 'Downloading', 'Download buttons']]
      .map(([k, n, s]) => sw(n, s, `data-a="${k}"`, S.ask[k])).join('')}
  </section>
  <section class="sf"><h3>Saving money</h3><p>Screenshots are most of the cost. These keep it down without making agents worse.</p>
    ${sw('Read the page first', 'Agents use the page text and a list of buttons and fields, and look at a screenshot only when they need to.', 'data-s="text"', S.text)}
    ${sw('Short memory for images', 'Only the last 2 screenshots stay in the conversation.', 'data-s="shortmem"', S.shortmem)}
    ${sw('Sharp screenshots', 'Send screenshots at full detail. Twice the tokens per image; turn on if agents misread small text.', 'data-s="sharp"', S.sharp)}
    ${sw('Remember what worked', 'Give agents the steps that worked last time on the same site.', 'data-s="routes"', S.routes)}
  </section>`;
  $('#sback').onclick = () => settingsView(false);
  $('#kget')?.addEventListener('click', e => { e.preventDefault(); invoke('tab_new', { url: 'https://aistudio.google.com/apikey' }); });
  $('#ktest').onclick = testKey;
  $('#key').onkeydown = e => { if (e.key === 'Enter') testKey(); };
  const num = (id, k, min, max) => { $(id).onchange = () => { const v = parseFloat($(id).value.replace(',', '.')); if (v >= min && v <= max) { S[k] = v; saveS(); draw(); } else $(id).value = S[k]; }; };
  num('#bs', 'budget', 0.05, 1000); num('#ba', 'perAgent', 0.01, 1000); num('#bm', 'max', 1, 20);
  const pick = (id, k) => { $(id).onchange = () => { S[k] = $(id).value; saveS(); $('#custom').hidden = !!(MODELS[S.lead] && MODELS[S.worker]); draw(); }; };
  pick('#mlead', 'lead'); pick('#mwork', 'worker'); pick('#tlead', 'leadThink'); pick('#twork', 'workerThink');
  $('#cin').onchange = () => { S.customIn = +$('#cin').value.replace(',', '.') || 0; saveS(); };
  $('#cout').onchange = () => { S.customOut = +$('#cout').value.replace(',', '.') || 0; saveS(); };
  $('#set').querySelectorAll('[data-s]').forEach(b => b.onclick = e => { e.preventDefault(); S[b.dataset.s] = !S[b.dataset.s]; saveS(); b.setAttribute('aria-checked', !!S[b.dataset.s]); if (b.dataset.s === 'auto') paintSettings(); });
  $('#set').querySelectorAll('[data-a]').forEach(b => b.onclick = e => { e.preventDefault(); S.ask[b.dataset.a] = !S.ask[b.dataset.a]; saveS(); b.setAttribute('aria-checked', !!S.ask[b.dataset.a]); });
}
async function testKey() {
  const k = $('#key').value.trim(), n = $('#knote'), b = $('#ktest');
  n.className = 'note'; n.textContent = 'Checking…'; b.disabled = true;
  try {
    if (!k) { await invoke('agent_key_set', { key: '' }); KEY = ''; n.textContent = 'Key removed.'; draw(); return; }
    const r = await hfetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': k } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error?.message || 'HTTP ' + r.status); }
    await invoke('agent_key_set', { key: k });
    KEY = k;
    fetchModels();
    n.className = 'note ok'; n.textContent = 'Works. Saved encrypted on this PC.';
    draw();
    if (lead.queue.length && !lead.busy) leadRun();
  } catch (e) { n.className = 'note bad'; n.textContent = 'That key didn\'t work: ' + (e.message || e); }
  finally { b.disabled = false; }
}

// ---------- 3D ASCII ----------
// A torus lit from above, rasterised into characters (the classic donut), sized to the band.
// It idles slowly and spins up while the lead thinks or agents work.
(() => {
  const pre = $('#ascii pre'), band = $('#ascii');
  const RAMP = '.,-~:;=!*#$@';
  let A = 1, B = 0.6, speed = 0.4, last = 0, cols = 80, rows = 22;
  const size = () => { cols = Math.max(30, Math.min(120, Math.floor((band.clientWidth - 8) / 4.85))); rows = 22; };
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(t) {
    if (!still) requestAnimationFrame(frame);
    if (document.hidden || band.offsetParent === null) return;
    if (t - last < 33) return; // ~30 fps
    const dt = Math.min(0.1, (t - last) / 1000 || 0.033);
    last = t;
    const busy = lead.busy || live().some(a => !a.paused && !a.hold);
    band.classList.toggle('busy', busy);
    speed += ((busy ? 1.6 : 0.35) - speed) * 0.05;
    A += dt * speed; B += dt * speed * 0.5;
    const W = cols, H = rows, out = new Array(W * H).fill(' '), z = new Float32Array(W * H);
    const sA = Math.sin(A), cA = Math.cos(A), sB = Math.sin(B), cB = Math.cos(B);
    // Character cells are ~4.85 x 6 px, so x is stretched to keep the ring round.
    const ky = H * 0.66, kx = ky * 1.24;
    for (let j = 0; j < 6.283; j += 0.07) {
      const cj = Math.cos(j), sj = Math.sin(j), h = cj + 2;
      for (let i = 0; i < 6.283; i += 0.02) {
        const si = Math.sin(i), ci = Math.cos(i);
        const D = 1 / (si * h * sA + sj * cA + 5), tt = si * h * cA - sj * sA;
        const x = Math.floor(W / 2 + kx * D * (ci * h * cB - tt * sB));
        const y = Math.floor(H / 2 + ky * D * (ci * h * sB + tt * cB));
        const o = x + W * y;
        if (y >= 0 && y < H && x >= 0 && x < W && D > z[o]) {
          z[o] = D;
          const N = Math.floor(8 * ((sj * sA - si * cj * cA) * cB - si * cj * sA - sj * cA - ci * cj * sB));
          out[o] = RAMP[N > 0 ? Math.min(N, 11) : 0];
        }
      }
    }
    let str = '';
    for (let r = 0; r < H; r++) str += out.slice(r * W, r * W + W).join('') + (r < H - 1 ? '\n' : '');
    pre.textContent = str;
  }
  size();
  addEventListener('resize', size);
  if (still) { last = -1e9; setTimeout(() => frame(0), 300); return; }
  requestAnimationFrame(frame);
})();

// ---------- Events from the browser ----------
listen('tab-closed', ({ payload: id }) => { for (const a of agents) if (a.tab === id && !a.stopped) stop(a, 'its tab was closed'); });
listen('agents-ask', ({ payload: text }) => { $('#q').value = text; grow(); $('#q').focus(); });

(async () => {
  KEY = await invoke('agent_key_get').catch(() => '');
  draw();
  if (KEY && !extra.length) fetchModels();
  $('#q').focus();
})();
