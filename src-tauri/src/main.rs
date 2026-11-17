#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ab;
mod agent;
mod desk;
mod dev;
mod dl;
mod ext;
mod perm;
mod tools;
mod vault;
mod vpn;
mod watch;

use std::sync::Mutex;
use tauri::{
    webview::{PageLoadEvent, WebviewBuilder},
    window::WindowBuilder,
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, WindowEvent,
};

// Height of the HTML chrome (tab strip 40 + toolbar 44); tabs sit below it.
// Grows by 30 when the bookmarks bar is shown (set_top).
static TOP_PX: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(84);
fn top() -> f64 {
    TOP_PX.load(std::sync::atomic::Ordering::Relaxed) as f64
}
const CHAT_W: f64 = 400.0;
const CHAT_URL: &str = "https://yukichat.lol";
const SIGNIN_REDIRECT: &str = "https://account.yukichat.lol/yukiweb";

#[derive(Default)]
struct State {
    next: u32,
    chat: bool,
    active: u32,
    // Zoom step per tab (index into tab_zoom's STEPS).
    zoom: std::collections::HashMap<u32, usize>,
    // InPrivate tabs: no cookies or storage kept once the last one closes.
    private: std::collections::HashSet<u32>,
}

// Hidden tabs are suspended after this many seconds (unless they play audio) to spare weak
// laptops; 0 = never. Settings → Performance changes it.
// A page is in fullscreen (video): chrome hidden, the tab fills the window.
static FULL: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

static SLEEP_AFTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(300);

// A downloaded update waiting for the user to hit "Restart to update".
#[derive(Default)]
struct Pending(Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>);

async fn check_update(app: AppHandle) -> tauri_plugin_updater::Result<()> {
    use tauri_plugin_updater::UpdaterExt;
    // Through the same local proxy as the tabs: where yuki.yukichat.lol is only reachable over
    // the VPN, a direct request fails ("error sending request").
    let mut b = app.updater_builder();
    let port = app.try_state::<vpn::Proxy>().map_or(0, |p| p.port);
    if port != 0 {
        if let Ok(p) = format!("http://127.0.0.1:{port}").parse() {
            b = b.proxy(p);
        }
    }
    let Some(u) = b.build()?.check().await? else { return Ok(()) };
    let bytes = u.download(|_, _| {}, || {}).await?;
    let v = u.version.clone();
    *app.state::<Pending>().0.lock().unwrap() = Some((u, bytes));
    let _ = app.emit_to("ui", "update", v);
    Ok(())
}

#[tauri::command]
async fn update_install(app: AppHandle) -> Result<(), String> {
    let pending = app.state::<Pending>().0.lock().unwrap().take();
    if let Some((u, bytes)) = pending {
        rlog(format!("installing {}", u.version));
        u.install(bytes).map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}

#[derive(Clone, serde::Serialize)]
struct TabEv {
    id: u32,
    url: String,
    loading: bool,
}

static BROWSER_ARGS: std::sync::OnceLock<String> = std::sync::OnceLock::new();
// Signed in to Yuki ID → pages see "YukiID" in the user agent and Yuki sites sign in by themselves.
static SIGNED_IN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// Every webview shares one WebView2 environment, so all must get identical args.
fn wb(label: impl Into<String>, url: WebviewUrl) -> WebviewBuilder<tauri::Wry> {
    // Tauri's own file-drop handler takes over OLE drag-drop on Windows and kills HTML5 DnD in pages.
    let b = WebviewBuilder::new(label, url).browser_extensions_enabled(true).disable_drag_drop_handler();
    match BROWSER_ARGS.get() {
        Some(a) => b.additional_browser_args(a),
        None => b,
    }
}

fn label(id: u32) -> String {
    format!("tab-{id}")
}

fn win_size(app: &AppHandle) -> (f64, f64) {
    let Some(w) = app.get_window("main") else { return (1280.0, 820.0) };
    let sf = w.scale_factor().unwrap_or(1.0);
    match w.inner_size() {
        Ok(s) => {
            let s = s.to_logical::<f64>(sf);
            (s.width, s.height)
        }
        Err(_) => (1280.0, 820.0),
    }
}

fn chat_rect(w: f64, h: f64) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    (
        LogicalPosition::new(w - CHAT_W - 8.0, top() + 4.0),
        LogicalSize::new(CHAT_W, (h - top() - 12.0).clamp(100.0, 680.0)),
    )
}

// Split view: two tabs side by side while either is active. Peek: a tab floating over the page.
static SPLIT: Mutex<Option<(u32, u32)>> = Mutex::new(None);
static PEEK: Mutex<Option<u32>> = Mutex::new(None);

fn partner(id: u32) -> Option<u32> {
    match *SPLIT.lock().unwrap() {
        Some((a, b)) if a == id => Some(b),
        Some((a, b)) if b == id => Some(a),
        _ => None,
    }
}

fn tab_rect(id: u32, w: f64, h: f64, t: f64) -> (f64, f64, f64, f64) {
    if t == 0.0 {
        return (0.0, 0.0, w, h);
    }
    // Yuki DevTools docked to a side or under the page.
    let (dl, dr, db) = dev::inset();
    let (x0, w, h) = (dl, w - dl - dr - agent::width(), h - db);
    if *PEEK.lock().unwrap() == Some(id) {
        return (x0 + (w * 0.08).round(), t + 16.0, (w * 0.84).round(), h - t - 32.0);
    }
    if let Some((a, b)) = *SPLIT.lock().unwrap() {
        let half = ((w - 6.0) / 2.0).floor();
        if id == a {
            return (x0, t, half, h - t);
        }
        if id == b {
            return (x0 + half + 6.0, t, w - half - 6.0, h - t);
        }
    }
    (x0, t, w, h - t)
}

fn layout(app: &AppHandle) {
    if let Some(wv) = app.get_webview("settings") {
        let (w, h) = win_size(app);
        let _ = wv.set_position(LogicalPosition::new(0.0, top()));
        let _ = wv.set_size(LogicalSize::new(w, h - top()));
    }
    let (w, h) = win_size(app);
    let t = if FULL.load(std::sync::atomic::Ordering::Relaxed) { 0.0 } else { top() };
    let act = app.state::<Mutex<State>>().lock().unwrap().active;
    for (l, wv) in app.webviews() {
        if l == "ui" {
            let _ = wv.set_size(LogicalSize::new(w, top()));
        } else if l.starts_with("tab-") {
            let id: u32 = l[4..].parse().unwrap_or(0);
            // Agent tabs you're not looking at keep painting off-screen at a fixed size.
            if agent::is_agent(id) && id != act && partner(act) != Some(id) && *PEEK.lock().unwrap() != Some(id) {
                let _ = wv.set_position(LogicalPosition::new(-20000.0, top()));
                let _ = wv.set_size(LogicalSize::new(agent::OFF_W, agent::OFF_H));
                continue;
            }
            let (x, y, tw, th) = tab_rect(id, w, h, t);
            let _ = wv.set_position(LogicalPosition::new(x, y));
            let _ = wv.set_size(LogicalSize::new(tw, th));
        } else if l == "chat" {
            let (p, s) = chat_rect(w, h);
            let _ = wv.set_position(p);
            let _ = wv.set_size(s);
        } else if l == "pop" || l == "panel" {
            let _ = wv.hide();
        }
    }
    dev::place(app, t == 0.0);
    agent::place(app, t == 0.0);
}

#[tauri::command]
async fn set_top(app: AppHandle, px: u32) {
    TOP_PX.store(px, std::sync::atomic::Ordering::Relaxed);
    layout(&app);
}

#[tauri::command]
async fn tab_split(app: AppHandle, pair: Option<(u32, u32)>) {
    *SPLIT.lock().unwrap() = pair;
    layout(&app);
    let active = app.state::<Mutex<State>>().lock().unwrap().active;
    tab_activate(app, active, false).await;
}

// Show `id` floating over the page (None = no peek; the UI then closes it or makes it a tab).
#[tauri::command]
async fn tab_peek(app: AppHandle, id: Option<u32>) {
    *PEEK.lock().unwrap() = id;
    layout(&app);
    if let Some(wv) = id.and_then(|id| app.get_webview(&label(id))) {
        let _ = wv.show();
        background(&wv, false);
        front(&wv);
        let _ = wv.set_focus();
    }
}

// The local proxy (sing-box "mixed" inbound) every tab goes through: the UI's own fetches of
// page addresses use it too, so they follow the same VPN rules as the tabs.
#[tauri::command]
async fn proxy_port(app: AppHandle) -> u16 {
    app.state::<vpn::Proxy>().port
}

#[tauri::command]
async fn tab_mute(app: AppHandle, id: u32, on: bool) {
    if let Some(wv) = app.get_webview(&label(id)) {
        let _ = wv.with_webview(move |pw| unsafe {
            #[cfg(windows)]
            {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_8;
                use windows::core::Interface;
                if let Ok(c8) = pw.controller().CoreWebView2().and_then(|c| c.cast::<ICoreWebView2_8>()) {
                    let _ = c8.SetIsMuted(on);
                }
            }
            #[cfg(not(windows))]
            let _ = (pw, on);
        });
    }
}

#[tauri::command]
async fn tab_sleep(app: AppHandle, id: u32) {
    if app.state::<Mutex<State>>().lock().unwrap().active == id || partner(id).is_some() {
        return;
    }
    if let Some(wv) = app.get_webview(&label(id)) {
        suspend(&app, id, &wv);
    }
}

// Task manager: memory of every WebView2 process (browser, pages, GPU, extensions…), in bytes.
#[tauri::command]
async fn proc_mem(app: AppHandle) -> Result<Vec<(u32, i32, u64)>, String> {
    let wv = app.get_webview("ui").ok_or("no ui")?;
    let (tx, rx) = std::sync::mpsc::channel::<Vec<(u32, i32)>>();
    wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        {
            use webview2_com::Microsoft::Web::WebView2::Win32::*;
            use windows::core::Interface;
            let mut out = vec![];
            if let Ok(env) = pw.controller().CoreWebView2().and_then(|c| c.cast::<ICoreWebView2_2>()).and_then(|c| c.Environment()).and_then(|e| e.cast::<ICoreWebView2Environment8>()) {
                if let Ok(list) = env.GetProcessInfos() {
                    let mut n = 0u32;
                    let _ = list.Count(&mut n);
                    for i in 0..n {
                        if let Ok(p) = list.GetValueAtIndex(i) {
                            let (mut pid, mut kind) = (0i32, COREWEBVIEW2_PROCESS_KIND::default());
                            let _ = p.ProcessId(&mut pid);
                            let _ = p.Kind(&mut kind);
                            out.push((pid as u32, kind.0));
                        }
                    }
                }
            }
            let _ = tx.send(out);
        }
        #[cfg(not(windows))]
        let _ = (pw, tx);
    })
    .map_err(|e| e.to_string())?;
    let list = rx.recv_timeout(std::time::Duration::from_secs(5)).map_err(|_| "timeout".to_string())?;
    Ok(list.into_iter().map(|(pid, kind)| (pid, kind, mem_of(pid))).collect())
}

#[cfg(windows)]
fn mem_of(pid: u32) -> u64 {
    use windows::Win32::System::{ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS}, Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION}};
    unsafe {
        let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return 0 };
        let mut c = PROCESS_MEMORY_COUNTERS { cb: std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32, ..Default::default() };
        let ok = K32GetProcessMemoryInfo(h, &mut c, c.cb).as_bool();
        let _ = windows::Win32::Foundation::CloseHandle(h);
        if ok { c.WorkingSetSize as u64 } else { 0 }
    }
}
#[cfg(not(windows))]
fn mem_of(_: u32) -> u64 {
    0
}

// One-time import: the browser's bookmarks file as-is (Chromium JSON); the UI picks what it needs.
#[tauri::command]
async fn import_bookmarks(browser: String) -> Result<serde_json::Value, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let dir = if browser == "edge" { r"Microsoft\Edge" } else { r"Google\Chrome" };
    let f = std::path::Path::new(&base).join(dir).join(r"User Data\Default\Bookmarks");
    let b = std::fs::read(&f).map_err(|_| format!("No {} bookmarks found on this PC", if browser == "edge" { "Edge" } else { "Chrome" }))?;
    serde_json::from_slice(&b).map_err(|e| e.to_string())
}

// A link or .html file YukiWeb was started with (Windows passes it as the first argument).
static LAUNCH: Mutex<Option<String>> = Mutex::new(None);
fn link_arg(args: &[String]) -> Option<String> {
    let a = args.iter().skip(1).find(|a| !a.starts_with('-'))?;
    if a.contains("://") {
        return Some(a.clone());
    }
    let p = std::path::Path::new(a);
    p.exists().then(|| tauri::Url::from_file_path(p.canonicalize().unwrap_or(p.into())).map(|u| u.to_string()).unwrap_or_default())
}

#[tauri::command]
async fn launch_url() -> Option<String> {
    LAUNCH.lock().unwrap().take()
}

// Default browser: Windows only lets the user choose, so we read the choice and open the page for it.
#[tauri::command]
async fn browser_default() -> bool {
    let out = std::process::Command::new("reg")
        .args(["query", r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice", "/v", "ProgId"])
        .creation_flags_quiet()
        .output();
    out.map(|o| String::from_utf8_lossy(&o.stdout).contains("YukiWebHTML")).unwrap_or(false)
}

#[tauri::command]
async fn browser_make_default() {
    // ShellExecute, not `explorer <uri>`: Explorer misreads the query and opens Documents instead.
    #[cfg(windows)]
    unsafe {
        use windows::{core::HSTRING, Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL}};
        ShellExecuteW(None, &HSTRING::from("open"), &HSTRING::from("ms-settings:defaultapps?registeredAppUser=YukiWeb"), None, None, SW_SHOWNORMAL);
    }
}

// No console window flashing up for `reg`.
trait Quiet {
    fn creation_flags_quiet(&mut self) -> &mut Self;
}
impl Quiet for std::process::Command {
    fn creation_flags_quiet(&mut self) -> &mut Self {
        #[cfg(windows)]
        std::os::windows::process::CommandExt::creation_flags(self, 0x0800_0000);
        self
    }
}

// Page fullscreen (YouTube etc.): hide the chrome and chat, make the window fullscreen.
fn set_full(app: &AppHandle, on: bool) {
    watch::crumb(format!("set_full {on} (was {})", FULL.load(std::sync::atomic::Ordering::Relaxed)));
    if FULL.swap(on, std::sync::atomic::Ordering::Relaxed) == on {
        return;
    }
    let chat = app.state::<Mutex<State>>().lock().unwrap().chat;
    for l in ["ui", "chat"] {
        if let Some(wv) = app.get_webview(l) {
            let _ = if on { wv.hide() } else if l == "ui" || chat { wv.show() } else { Ok(()) };
        }
    }
    if let Some(w) = app.get_window("main") {
        let _ = w.set_fullscreen(on);
    }
    layout(app);
}

// UI language (en/ru/de) for the error pages, which load without the shared i18n.js.
static LANG: Mutex<String> = Mutex::new(String::new());

#[tauri::command]
async fn set_lang(lang: String) {
    *LANG.lock().unwrap() = lang;
}

// For Wrapped: time only counts while YukiWeb is the foreground window and someone is at the PC.
#[tauri::command]
async fn active_state(app: AppHandle) -> (bool, u32) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let fg = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    let focused = app.get_window("main").and_then(|w| w.hwnd().ok()).map_or(false, |h| h.0 as isize == fg);
    let mut li = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    let idle = if unsafe { GetLastInputInfo(&mut li) }.as_bool() {
        unsafe { windows::Win32::System::SystemInformation::GetTickCount() }.wrapping_sub(li.dwTime)
    } else {
        0
    };
    (focused, idle)
}

fn error_html(kind: &str, url: &str) -> String {
    let data = serde_json::json!({ "kind": kind, "url": url, "lang": *LANG.lock().unwrap(), "vpn": vpn::active() })
        .to_string()
        .replace("</", "<\\/");
    include_str!("../../src/error.html").replace("/*ERR*/null", &data)
}

// bg: open behind the current tab (middle-click). slot: the UI's placeholder for a restored tab.
// Speed: creating a WebView2 takes 1–3 s, so one hidden tab with the new tab page waits ready.
// A new tab takes it (navigating it if it's for a link) and the next spare is made in the background.
static SPARE: Mutex<Option<u32>> = Mutex::new(None);
static SPARE_BUSY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

fn schedule_spare(app: &AppHandle) {
    if SPARE.lock().unwrap().is_some() || SPARE_BUSY.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(2500));
        let id = {
            let st = a.state::<Mutex<State>>();
            let mut s = st.lock().unwrap();
            s.next += 1;
            s.next
        };
        if let Ok(wv) = build_tab(&a, id, WebviewUrl::App("newtab.html".into()), false, true) {
            background(&wv, true);
            *SPARE.lock().unwrap() = Some(id);
        }
        SPARE_BUSY.store(false, std::sync::atomic::Ordering::SeqCst);
    });
}

fn create_tab(app: &AppHandle, url: Option<String>, bg: bool, slot: Option<i64>, private: bool) -> Result<u32, String> {
    // Only plain new tabs take the spare: re-pointing it at a link didn't reliably navigate
    // (the tab stayed on the new tab page while the address bar showed the link).
    let plain = url.as_deref().map_or(true, str::is_empty);
    let spare = if private || !plain { None } else { SPARE.lock().unwrap().take() };
    if let Some(wv) = spare.and_then(|id| app.get_webview(&label(id))) {
        let id = spare.unwrap();
        layout(app);
        if !bg {
            background(&wv, false);
        }
        let _ = app.emit_to("ui", "tab-opened", (id, url.unwrap_or_default(), bg, slot, private));
        schedule_spare(app);
        return Ok(id);
    }
    let win = app.get_window("main").ok_or("no window")?;
    let id = {
        let st = app.state::<Mutex<State>>();
        let mut s = st.lock().unwrap();
        s.next += 1;
        if private {
            let n = s.next;
            s.private.insert(n);
        }
        s.next
    };
    let target = match url.as_deref() {
        Some(u) if !u.is_empty() => {
            WebviewUrl::External(u.parse::<tauri::Url>().map_err(|e| e.to_string())?)
        }
        _ => WebviewUrl::App("newtab.html".into()),
    };
    let _ = win;
    build_tab(app, id, target, private, bg)?;
    let _ = app.emit_to("ui", "tab-opened", (id, url.unwrap_or_default(), bg, slot, private));
    schedule_spare(app);
    Ok(id)
}

// A tab webview; `hidden` ones start off-screen so they never flash over the page.
fn build_tab(app: &AppHandle, id: u32, target: WebviewUrl, private: bool, hidden: bool) -> Result<Webview, String> {
    let win = app.get_window("main").ok_or("no window")?;
    let h = app.clone();
    let s = app.clone();
    // Hidden ones (background, spare, agent tabs) must not take keyboard focus when created:
    // Tauri focuses new webviews by default, which swallowed whatever the user was typing.
    let b = wb(label(id), target)
        .focused(!hidden)
        .incognito(private)
        .on_page_load(move |_, p| {
            let ev = TabEv {
                id,
                url: p.url().to_string(),
                loading: matches!(p.event(), PageLoadEvent::Started),
            };
            let _ = h.emit_to("ui", "tab", ev);
        })
        // Yuki ID sign-in: YukiChat redirects here with a one-time code; hand it to the UI instead of loading it.
        .on_navigation(move |url| {
            if url.as_str().starts_with(SIGNIN_REDIRECT) {
                let _ = s.emit_to("ui", "signin", (id, url.to_string()));
                return false;
            }
            true
        });
    let (w, hh) = win_size(app);
    let pos = if hidden { LogicalPosition::new(-20000.0, 0.0) } else { LogicalPosition::new(0.0, top()) };
    let (x, y, tw, th) = tab_rect(id, w, hh, top());
    let pos = if hidden { pos } else { LogicalPosition::new(x, y) };
    let wv = win.add_child(b, pos, LogicalSize::new(tw, th)).map_err(|e| e.to_string())?;
    hook(app.clone(), id, &wv);
    if hidden {
        let _ = wv.hide();
        background(&wv, true);
        let _ = wv.set_position(LogicalPosition::new(x, y));
    }
    Ok(wv)
}

// Webview-creating commands must be async: sync commands run on the main
// thread and creating a webview there deadlocks on Windows.
#[tauri::command]
async fn tab_new(app: AppHandle, url: Option<String>, slot: Option<i64>, bg: Option<bool>, private: Option<bool>) -> Result<u32, String> {
    create_tab(&app, url, bg.unwrap_or(false), slot, private.unwrap_or(false))
}

#[tauri::command]
async fn tab_activate(app: AppHandle, id: u32, focus_ui: bool) {
    watch::crumb(format!("tab_activate {id}"));
    let me = label(id);
    let pair = partner(id);
    let other = pair.map(label);
    let prev = std::mem::replace(&mut app.state::<Mutex<State>>().lock().unwrap().active, id);
    // Switching away from a fullscreen video always gives the window (and taskbar) back.
    if prev != id && FULL.load(std::sync::atomic::Ordering::Relaxed) {
        if let Some(wv) = app.get_webview(&label(prev)) {
            let _ = wv.eval("document.fullscreenElement && document.exitFullscreen()");
        }
        let a2 = app.clone();
        let _ = app.run_on_main_thread(move || set_full(&a2, false));
    }
    for (l, wv) in app.webviews() {
        if l.starts_with("tab-") && l != me && Some(&l) != other.as_ref() && !agent::is_agent(l[4..].parse().unwrap_or(0)) {
            let _ = wv.hide();
        }
    }
    if let Some(wv) = other.and_then(|o| app.get_webview(&o)) {
        let _ = wv.show();
        background(&wv, false);
    }
    if prev != 0 && prev != id && Some(prev) != pair && !agent::is_agent(prev) {
        if let Some(wv) = app.get_webview(&label(prev)) {
            background(&wv, true);
            let a = app.clone();
            let secs = SLEEP_AFTER.load(std::sync::atomic::Ordering::Relaxed);
            std::thread::spawn(move || {
                if secs == 0 {
                    return;
                }
                std::thread::sleep(std::time::Duration::from_secs(secs));
                let now = a.state::<Mutex<State>>().lock().unwrap().active;
                if now != prev && partner(now) != Some(prev) {
                    if let Some(wv) = a.get_webview(&label(prev)) {
                        suspend(&a, prev, &wv);
                    }
                }
            });
        }
    }
    if let Some(wv) = app.get_webview(&me) {
        let _ = wv.show();
        background(&wv, false);
        let _ = app.emit_to("ui", "tab-sleep", (id, false));
        if !focus_ui {
            let _ = wv.set_focus();
        }
    }
    if focus_ui {
        if let Some(ui) = app.get_webview("ui") {
            let _ = ui.set_focus();
        }
    }
    let chat = app.state::<Mutex<State>>().lock().unwrap().chat;
    if chat {
        if let Some(c) = app.get_webview("chat") {
            front(&c);
        }
    }
    dev::attach(&app, id);
    if agent::any() {
        layout(&app);
    }
}

#[tauri::command]
async fn tab_close(app: AppHandle, id: u32) {
    watch::crumb(format!("tab_close {id}"));
    app.state::<Mutex<State>>().lock().unwrap().private.remove(&id);
    dev::forget(id);
    agent::forget(id);
    if let Some(wv) = app.get_webview(&label(id)) {
        let _ = wv.close();
    }
}

#[tauri::command]
async fn tab_nav(app: AppHandle, id: u32, url: String) -> Result<(), String> {
    let wv = app.get_webview(&label(id)).ok_or("no tab")?;
    let u = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    wv.navigate(u).map_err(|e| e.to_string())
}

#[tauri::command]
async fn tab_cmd(app: AppHandle, id: u32, cmd: String) {
    let js = match cmd.as_str() {
        "back" => "history.back()",
        "forward" => "history.forward()",
        "reload" => "location.reload()",
        "print" => "window.print()",
        _ => return,
    };
    if let Some(wv) = app.get_webview(&label(id)) {
        let _ = wv.eval(js);
    }
}

#[tauri::command]
async fn tab_error(app: AppHandle, id: u32, kind: String, url: String) {
    if let Some(wv) = app.get_webview(&label(id)) {
        show_error(&wv, kind, url);
    }
}

// Chat takes ~7 s to create: after startup the UI asks for it hidden (only for people who use it).
#[tauri::command]
async fn chat_prewarm(app: AppHandle) -> Result<(), String> {
    if app.get_webview("chat").is_some() {
        return Ok(());
    }
    let win = app.get_window("main").ok_or("no window")?;
    let (w, h) = win_size(&app);
    let (_, s) = chat_rect(w, h);
    let url = CHAT_URL.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let c = win.add_child(wb("chat", WebviewUrl::External(url)).focused(false), LogicalPosition::new(-20000.0, 0.0), s).map_err(|e| e.to_string())?;
    hook(app.clone(), 0, &c);
    let _ = c.hide();
    background(&c, true);
    Ok(())
}

#[tauri::command]
async fn chat_toggle(app: AppHandle) -> Result<bool, String> {
    watch::crumb("chat_toggle");
    let open = {
        let st = app.state::<Mutex<State>>();
        let mut s = st.lock().unwrap();
        s.chat = !s.chat;
        s.chat
    };
    let (w, h) = win_size(&app);
    let (p, s) = chat_rect(w, h);
    match app.get_webview("chat") {
        Some(c) if open => {
            let _ = c.set_position(p);
            let _ = c.set_size(s);
            let _ = c.show();
            background(&c, false);
            front(&c);
            let _ = c.set_focus();
        }
        Some(c) => {
            let _ = c.hide();
            background(&c, true);
        }
        None => {
            let win = app.get_window("main").ok_or("no window")?;
            let url = CHAT_URL.parse::<tauri::Url>().map_err(|e| e.to_string())?;
            let c = win
                .add_child(wb("chat", WebviewUrl::External(url)), p, s)
                .map_err(|e| e.to_string())?;
            hook(app.clone(), 0, &c);
        }
    }
    Ok(open)
}

#[tauri::command]
async fn pop_show(app: AppHandle, x: f64, w: f64, h: f64) {
    if let Some(p) = app.get_webview("pop") {
        let _ = p.set_position(LogicalPosition::new(x, top() - 2.0));
        let _ = p.set_size(LogicalSize::new(w, h));
        let _ = p.show();
        front(&p);
    }
}

#[tauri::command]
async fn pop_hide(app: AppHandle) {
    if let Some(p) = app.get_webview("pop") {
        let _ = p.hide();
    }
}

const PANEL_W: f64 = 340.0;

#[tauri::command]
async fn panel_show(app: AppHandle, right: f64, view: String, height: f64) {
    watch::crumb(format!("panel_show {view}"));
    if let Some(p) = app.get_webview("panel") {
        let (_, h) = win_size(&app);
        let _ = p.set_position(LogicalPosition::new((right - PANEL_W).max(8.0), top() - 2.0));
        let _ = p.set_size(LogicalSize::new(PANEL_W, (h - top() - 8.0).min(height)));
        let _ = p.show();
        front(&p);
        let _ = p.set_focus();
        let _ = p.emit_to("panel", "panel-open", view);
    }
}

#[tauri::command]
async fn panel_hide(app: AppHandle) {
    if let Some(p) = app.get_webview("panel") {
        let _ = p.hide();
    }
    let _ = app.emit_to("ui", "panel-closed", ());
}

// Settings is its own webview over the page area (tabs get no IPC, settings needs it).
#[tauri::command]
async fn settings_show(app: AppHandle, open: bool) -> Result<(), String> {
    watch::crumb(format!("settings_show {open}"));
    match app.get_webview("settings") {
        Some(s) if open => {
            let _ = s.show();
            front(&s);
            let _ = s.set_focus();
            let _ = s.emit_to("settings", "settings-open", ());
        }
        Some(s) => {
            let _ = s.hide();
        }
        None if open => {
            let win = app.get_window("main").ok_or("no window")?;
            let (w, h) = win_size(&app);
            let s = win
                .add_child(wb("settings", WebviewUrl::App("settings.html".into())), LogicalPosition::new(0.0, top()), LogicalSize::new(w, h - top()))
                .map_err(|e| e.to_string())?;
            front(&s);
        }
        None => {}
    }
    Ok(())
}

// step: +1 / -1 / 0 (reset). Returns the new zoom in percent.
#[tauri::command]
async fn tab_zoom(app: AppHandle, id: u32, step: i32) -> Result<u32, String> {
    const STEPS: [f64; 11] = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];
    let wv = app.get_webview(&label(id)).ok_or("no tab")?;
    let st = app.state::<Mutex<State>>();
    let cur = *st.lock().unwrap().zoom.get(&id).unwrap_or(&5);
    let i = if step == 0 { 5 } else { (cur as i32 + step).clamp(0, STEPS.len() as i32 - 1) as usize };
    wv.set_zoom(STEPS[i]).map_err(|e| e.to_string())?;
    st.lock().unwrap().zoom.insert(id, i);
    Ok((STEPS[i] * 100.0).round() as u32)
}

#[tauri::command]
async fn set_sleep(secs: u64) {
    SLEEP_AFTER.store(secs, std::sync::atomic::Ordering::Relaxed);
}

// Cookies, cache, history and site storage for every site. Wipes the chrome's localStorage
// too, so settings.html restores its own keys afterwards.
#[tauri::command]
async fn clear_data(app: AppHandle) -> Result<(), String> {
    let wv = app.get_webview("ui").ok_or("no ui")?;
    let (tx, rx) = std::sync::mpsc::channel::<()>();
    wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        {
            use webview2_com::{ClearBrowsingDataCompletedHandler, Microsoft::Web::WebView2::Win32::*};
            use windows::core::Interface;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            if let Ok(p) = core.cast::<ICoreWebView2_13>().and_then(|c| c.Profile()).and_then(|p| p.cast::<ICoreWebView2Profile2>()) {
                // Saved passwords and autofill stay; they're not "browsing data" to most people.
                let kinds = COREWEBVIEW2_BROWSING_DATA_KINDS(
                    COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_PROFILE.0
                        & !(COREWEBVIEW2_BROWSING_DATA_KINDS_PASSWORD_AUTOSAVE.0 | COREWEBVIEW2_BROWSING_DATA_KINDS_GENERAL_AUTOFILL.0),
                );
                let _ = p.ClearBrowsingData(kinds, &ClearBrowsingDataCompletedHandler::create(Box::new(move |_| {
                    let _ = tx.send(());
                    Ok(())
                })));
            }
        }
        #[cfg(not(windows))]
        let _ = (pw, tx);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(20)).map_err(|_| "Clearing took too long".to_string())
}

#[tauri::command]
async fn ui_focus(app: AppHandle) {
    if let Some(ui) = app.get_webview("ui") {
        let _ = ui.set_focus();
    }
}

// Raise a child webview above its siblings (later-created tabs would cover it).
#[cfg(windows)]
fn front(wv: &Webview) {
    let _ = wv.with_webview(|pw| unsafe {
        use windows::Win32::{Foundation::HWND, UI::WindowsAndMessaging::*};
        let mut h = HWND::default();
        if pw.controller().ParentWindow(&mut h).is_ok() {
            let _ = SetWindowPos(h, Some(HWND_TOP), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
    });
}

#[cfg(not(windows))]
fn front(_: &Webview) {}

// Hidden webviews ask WebView2 to trim memory; shown ones go back to normal (and wake if suspended).
#[cfg(windows)]
fn background(wv: &Webview, hidden: bool) {
    let _ = wv.with_webview(move |pw| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows::core::Interface;
        let Ok(core) = pw.controller().CoreWebView2() else { return };
        if !hidden {
            if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
                let _ = c3.Resume();
            }
        }
        if let Ok(c19) = core.cast::<ICoreWebView2_19>() {
            let _ = c19.SetMemoryUsageTargetLevel(if hidden {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            });
        }
    });
}

// Freeze a hidden tab's scripts and timers; it resumes when shown. Tabs playing audio keep running.
#[cfg(windows)]
fn suspend(app: &AppHandle, id: u32, wv: &Webview) {
    let a = app.clone();
    let _ = wv.with_webview(move |pw| unsafe {
        use webview2_com::{Microsoft::Web::WebView2::Win32::*, TrySuspendCompletedHandler};
        use windows::core::{Interface, BOOL};
        let Ok(core) = pw.controller().CoreWebView2() else { return };
        if let Ok(c8) = core.cast::<ICoreWebView2_8>() {
            let mut audio = BOOL(0);
            if c8.IsDocumentPlayingAudio(&mut audio).is_ok() && audio.as_bool() {
                return;
            }
        }
        if let Ok(c3) = core.cast::<ICoreWebView2_3>() {
            let _ = c3.TrySuspend(&TrySuspendCompletedHandler::create(Box::new(move |_, ok| {
                if ok {
                    let _ = a.emit_to("ui", "tab-sleep", (id, true));
                }
                Ok(())
            })));
        }
    });
}

#[cfg(not(windows))]
fn background(_: &Webview, _: bool) {}
#[cfg(not(windows))]
fn suspend(_: &AppHandle, _: u32, _: &Webview) {}

// Navigations that haven't received a byte yet: (tab, navigation id, url). A dead VPN server
// or a black-holed site never fails the navigation, it just leaves the tab white forever.
static HANG: Mutex<Vec<(u32, u64, String)>> = Mutex::new(Vec::new());

fn watch_hang(app: &AppHandle, id: u32, nid: u64, url: String) {
    {
        let mut w = HANG.lock().unwrap();
        w.retain(|w| w.0 != id);
        w.push((id, nid, url.clone()));
    }
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(20));
        let mut w = HANG.lock().unwrap();
        let Some(i) = w.iter().position(|w| w.0 == id && w.1 == nid) else { return };
        w.remove(i);
        drop(w);
        let kind = if vpn::active().is_empty() { "slow" } else { "vpn" };
        rlog(format!("nav hang: tab {id} {kind} {url}"));
        if let Some(wv) = a.get_webview(&label(id)) {
            let _ = a.emit_to("ui", "tab-err", (id, kind, &url));
            show_error(&wv, kind.into(), url);
        }
    });
}

#[cfg(windows)]
fn show_error(wv: &Webview, kind: String, url: String) {
    let _ = wv.with_webview(move |pw| unsafe {
        if let Ok(c) = pw.controller().CoreWebView2() {
            let _ = c.NavigateToString(&windows::core::HSTRING::from(error_html(&kind, &url)));
        }
    });
}

#[cfg(not(windows))]
fn show_error(wv: &Webview, kind: String, url: String) {
    let html = serde_json::to_string(&error_html(&kind, &url)).unwrap();
    let _ = wv.eval(&format!("document.open();document.write({html});document.close()"));
}

// WebView2 events Tauri doesn't expose: titles, favicons, popups, failed
// loads and Ctrl shortcuts while a page has focus. id 0 = the chat panel.
#[cfg(windows)]
fn hook(app: AppHandle, id: u32, wv: &Webview) {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, *};
    use windows::{
        core::{Interface, PWSTR},
        Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VK_CONTROL, VK_SHIFT},
    };
    let _ = wv.with_webview(move |pw| unsafe {
        let ctl = pw.controller();
        let Ok(core) = ctl.CoreWebView2() else { return };
        let mut tok = 0i64;
        apply_ua(&core);
        dl::hook(app.clone(), &core);
        perm::hook(app.clone(), id, &core);

        if id != 0 {
            if let Ok(s) = core.Settings() {
                let _ = s.SetIsBuiltInErrorPageEnabled(false);
                // Saved passwords and form autofill (WebView2 has them, off by default).
                if let Ok(s4) = s.cast::<ICoreWebView2Settings4>() {
                    // Passwords live in YukiWeb's own vault (vault.rs); WebView2's saver can't be managed.
                    let _ = s4.SetIsPasswordAutosaveEnabled(false);
                    let _ = s4.SetIsGeneralAutofillEnabled(true);
                }
            }
            // tab.js: find, selection toolbar, notes, translation, PiP button. It messages the UI
            // with chrome.webview.postMessage; any page can post too, so the UI treats it as untrusted.
            let _ = core.AddScriptToExecuteOnDocumentCreated(
                &windows::core::HSTRING::from(include_str!("../../src/tab.js")),
                &AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|_, _| Ok(()))),
            );
            // moo.js: the built-in cow; sleeps until the UI hands it settings (Settings → Moo).
            let _ = core.AddScriptToExecuteOnDocumentCreated(
                &windows::core::HSTRING::from(include_str!("../../src/moo.js")),
                &AddScriptToExecuteOnDocumentCreatedCompletedHandler::create(Box::new(|_, _| Ok(()))),
            );
            let a = app.clone();
            let _ = core.add_WebMessageReceived(
                &WebMessageReceivedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut p = PWSTR::null();
                    if args.TryGetWebMessageAsString(&mut p).is_ok() {
                        let m = take_pwstr(p);
                        if m.len() < 20000 && m.starts_with("{\"yw\":1") {
                            let _ = a.emit_to("ui", "tab-msg", (id, m));
                        }
                    }
                    Ok(())
                })),
                &mut tok,
            );
            // Speaker icon on the tab: playing / muted.
            if let Ok(c8) = core.cast::<ICoreWebView2_8>() {
                let audio = move |a: &AppHandle, s: Option<ICoreWebView2>| {
                    if let Some(c8) = s.and_then(|s| s.cast::<ICoreWebView2_8>().ok()) {
                        let (mut p, mut m) = (windows::core::BOOL(0), windows::core::BOOL(0));
                        let _ = c8.IsDocumentPlayingAudio(&mut p);
                        let _ = c8.IsMuted(&mut m);
                        let _ = a.emit_to("ui", "tab-audio", (id, p.as_bool(), m.as_bool()));
                    }
                };
                let a = app.clone();
                let _ = c8.add_IsDocumentPlayingAudioChanged(
                    &IsDocumentPlayingAudioChangedEventHandler::create(Box::new(move |s, _| { audio(&a, s); Ok(()) })),
                    &mut tok,
                );
                let a = app.clone();
                let _ = c8.add_IsMutedChanged(&IsMutedChangedEventHandler::create(Box::new(move |s, _| { audio(&a, s); Ok(()) })), &mut tok);
            }
            // VPN site list: while this tab shows a listed site, note every host its page loads from
            // so those take the same route (the request filter exists only on such pages).
            // The ad blocker (ab.rs) looks at every request too, so the filter is always on.
            let site: std::rc::Rc<std::cell::RefCell<Option<String>>> = Default::default();
            let page: std::rc::Rc<std::cell::RefCell<String>> = Default::default();
            let _ = core.AddWebResourceRequestedFilter(&windows::core::HSTRING::from("*"), COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL);
            // Latest navigation, so a late failure of one the page already moved past is ignored.
            let nav: std::rc::Rc<std::cell::Cell<u64>> = Default::default();
            let (a, st, nv, pg) = (app.clone(), site.clone(), nav.clone(), page.clone());
            let _ = core.add_NavigationStarting(
                &NavigationStartingEventHandler::create(Box::new(move |s, args| {
                    let (Some(s), Some(args)) = (s, args) else { return Ok(()) };
                    let mut nid = 0u64;
                    if args.NavigationId(&mut nid).is_ok() { nv.set(nid); }
                    let mut p = PWSTR::null();
                    args.Uri(&mut p)?;
                    let u = take_pwstr(p);
                    if id != 0 && (u.starts_with("http://") || u.starts_with("https://")) {
                        watch::crumb(format!("nav tab {id} {}", u.split('/').nth(2).unwrap_or("")));
                        watch_hang(&a, id, nid, u.clone());
                    }
                    let host = u.parse::<tauri::Url>().ok().and_then(|u| u.host_str().map(str::to_string)).unwrap_or_default();
                    let _ = &s;
                    *st.borrow_mut() = vpn::site_of(&a, &host);
                    ab::reset(&a, id);
                    *pg.borrow_mut() = host;
                    Ok(())
                })),
                &mut tok,
            );
            // Same-document URL changes (history.pushState, #hash, back/forward inside a web app)
            // don't fire a page load, so the address bar would keep showing the old path.
            if id != 0 {
                let a = app.clone();
                let _ = core.add_SourceChanged(
                    &SourceChangedEventHandler::create(Box::new(move |s, args| {
                        let (Some(s), Some(args)) = (s, args) else { return Ok(()) };
                        let mut new_doc = windows::core::BOOL(0);
                        let _ = args.IsNewDocument(&mut new_doc);
                        if new_doc.as_bool() { return Ok(()) }
                        let mut p = PWSTR::null();
                        s.Source(&mut p)?;
                        let _ = a.emit_to("ui", "tab-url", (id, take_pwstr(p)));
                        Ok(())
                    })),
                    &mut tok,
                );
            }
            let a = app.clone();
            let env = core.cast::<ICoreWebView2_2>().and_then(|c| c.Environment()).ok();
            let _ = core.add_WebResourceRequested(
                &WebResourceRequestedEventHandler::create(Box::new(move |_, args| {
                    let Some(args) = args else { return Ok(()) };
                    let mut p = PWSTR::null();
                    args.Request()?.Uri(&mut p)?;
                    let Some(h) = take_pwstr(p).parse::<tauri::Url>().ok().and_then(|u| u.host_str().map(str::to_string)) else { return Ok(()) };
                    if let Some(site) = site.borrow().as_deref() {
                        vpn::learn(&a, site, &h);
                    }
                    if ab::check(&a, id, &page.borrow(), &h) {
                        if let Some(env) = &env {
                            if let Ok(r) = env.CreateWebResourceResponse(None, 403, &windows::core::HSTRING::from("Blocked"), &windows::core::HSTRING::new()) {
                                let _ = args.SetResponse(&r);
                            }
                        }
                    }
                    Ok(())
                })),
                &mut tok,
            );
            let a = app.clone();
            let _ = core.add_ContainsFullScreenElementChanged(
                &ContainsFullScreenElementChangedEventHandler::create(Box::new(move |s, _| {
                    if let Some(s) = s {
                        let mut on = Default::default();
                        s.ContainsFullScreenElement(&mut on)?;
                        // Only the tab you're looking at may take the window fullscreen: a hidden,
                        // spare or peek tab going fullscreen used to cover the taskbar and freeze
                        // the window. Queued so it never runs inside WebView2's own callback.
                        let on = on.as_bool();
                        watch::crumb(format!("page fullscreen {on} tab {id} active {}", a.state::<Mutex<State>>().lock().unwrap().active));
                        if a.state::<Mutex<State>>().lock().unwrap().active == id {
                            let a2 = a.clone();
                            let _ = a.run_on_main_thread(move || set_full(&a2, on));
                        }
                    }
                    Ok(())
                })),
                &mut tok,
            );
            // Links: "Open link in new tab" (background) instead of WebView2's "new window".
            if let (Ok(c11), Ok(env)) = (
                core.cast::<ICoreWebView2_11>(),
                core.cast::<ICoreWebView2_2>().and_then(|c| c.Environment()).and_then(|e| e.cast::<ICoreWebView2Environment9>()),
            ) {
                let a = app.clone();
                let _ = c11.add_ContextMenuRequested(
                    &ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
                        let Some(args) = args else { return Ok(()) };
                        // "Inspect" opens Yuki DevTools on the clicked element, not Chromium's window.
                        {
                            let items = args.MenuItems()?;
                            let mut n = 0u32;
                            items.Count(&mut n)?;
                            for i in (0..n).rev() {
                                let it = items.GetValueAtIndex(i)?;
                                let mut name = PWSTR::null();
                                it.Name(&mut name)?;
                                if take_pwstr(name) != "inspectElement" {
                                    continue;
                                }
                                items.RemoveValueAtIndex(i)?;
                                let item = env.CreateContextMenuItem(
                                    &windows::core::HSTRING::from("Inspect"),
                                    None::<&windows::Win32::System::Com::IStream>,
                                    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
                                )?;
                                let a = a.clone();
                                item.add_CustomItemSelected(
                                    &CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                                        let a = a.clone();
                                        tauri::async_runtime::spawn(async move { let _ = dev::dev_go(a, "inspect".into()).await; });
                                        Ok(())
                                    })),
                                    &mut 0i64,
                                )?;
                                items.InsertValueAtIndex(i, &item)?;
                            }
                        }
                        let t = args.ContextMenuTarget()?;
                        let mut has = Default::default();
                        t.HasLinkUri(&mut has)?;
                        if !has.as_bool() {
                            return Ok(());
                        }
                        let mut p = PWSTR::null();
                        t.LinkUri(&mut p)?;
                        let link = take_pwstr(p);
                        let items = args.MenuItems()?;
                        let mut n = 0u32;
                        items.Count(&mut n)?;
                        let mut at = 0u32;
                        for i in (0..n).rev() {
                            let it = items.GetValueAtIndex(i)?;
                            let mut name = PWSTR::null();
                            it.Name(&mut name)?;
                            if take_pwstr(name) == "openLinkInNewWindow" {
                                items.RemoveValueAtIndex(i)?;
                                at = i;
                            }
                        }
                        let item = env.CreateContextMenuItem(
                            &windows::core::HSTRING::from("Open link in new tab"),
                            None::<&windows::Win32::System::Com::IStream>,
                            COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_COMMAND,
                        )?;
                        let a = a.clone();
                        item.add_CustomItemSelected(
                            &CustomItemSelectedEventHandler::create(Box::new(move |_, _| {
                                let (a, u) = (a.clone(), link.clone());
                                std::thread::spawn(move || {
                                    let p = a.state::<Mutex<State>>().lock().unwrap().private.contains(&id);
                                    let _ = create_tab(&a, Some(u), true, None, p);
                                });
                                Ok(())
                            })),
                            &mut 0i64,
                        )?;
                        items.InsertValueAtIndex(at, &item)?;
                        Ok(())
                    })),
                    &mut tok,
                );
            }
            let a = app.clone();
            let _ = core.add_DocumentTitleChanged(
                &DocumentTitleChangedEventHandler::create(Box::new(move |s, _| {
                    if let Some(s) = s {
                        let mut p = PWSTR::null();
                        s.DocumentTitle(&mut p)?;
                        let _ = a.emit_to("ui", "tab-title", (id, take_pwstr(p)));
                    }
                    Ok(())
                })),
                &mut tok,
            );
            if let Ok(c15) = core.cast::<ICoreWebView2_15>() {
                let a = app.clone();
                let _ = c15.add_FaviconChanged(
                    &FaviconChangedEventHandler::create(Box::new(move |s, _| {
                        if let Some(s) = s.and_then(|s| s.cast::<ICoreWebView2_15>().ok()) {
                            let mut p = PWSTR::null();
                            s.FaviconUri(&mut p)?;
                            let _ = a.emit_to("ui", "tab-icon", (id, take_pwstr(p)));
                        }
                        Ok(())
                    })),
                    &mut tok,
                );
            }
            // The page answered (or failed on its own): no longer a hang.
            let _ = core.add_ContentLoading(
                &ContentLoadingEventHandler::create(Box::new(move |_, _| { HANG.lock().unwrap().retain(|w| w.0 != id); Ok(()) })),
                &mut tok,
            );
            let _ = core.add_NavigationCompleted(
                &NavigationCompletedEventHandler::create(Box::new(move |_, _| { HANG.lock().unwrap().retain(|w| w.0 != id); Ok(()) })),
                &mut tok,
            );
            let a = app.clone();
            let _ = core.add_NavigationCompleted(
                &NavigationCompletedEventHandler::create(Box::new(move |s, args| {
                    let (Some(s), Some(args)) = (s, args) else { return Ok(()) };
                    let mut ok = Default::default();
                    args.IsSuccess(&mut ok)?;
                    if ok.as_bool() {
                        return Ok(());
                    }
                    let mut st = COREWEBVIEW2_WEB_ERROR_STATUS::default();
                    args.WebErrorStatus(&mut st)?;
                    let mut nid = 0u64;
                    let _ = args.NavigationId(&mut nid);
                    // The server answered (4xx/5xx, bot checks): its own page is already showing.
                    let mut http = 0i32;
                    if let Ok(a2) = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>() {
                        let _ = a2.HttpStatusCode(&mut http);
                    }
                    let stale = nid != 0 && nid != nav.get();
                    // 0 UNKNOWN (window.stop, 204, downloads), 9 ABORTED (handed to a download or
                    // replaced by another navigation), 14 CANCELED (user navigated away).
                    if stale || http != 0 || matches!(st.0, 0 | 9 | 14) {
                        rlog(format!("nav fail ignored: st={} http={http} stale={stale}", st.0));
                        return Ok(());
                    }
                    let kind = match st.0 {
                        1..=5 => "cert",
                        11 => "offline",
                        13 => "dns",
                        _ => "connect",
                    };
                    let mut p = PWSTR::null();
                    s.Source(&mut p)?;
                    let u = take_pwstr(p);
                    let _ = a.emit_to("ui", "tab-err", (id, kind, &u));
                    s.NavigateToString(&windows::core::HSTRING::from(error_html(kind, &u)))?;
                    Ok(())
                })),
                &mut tok,
            );
        }

        let a = app.clone();
        let _ = core.add_NewWindowRequested(
            &NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
                if let Some(args) = args {
                    let mut p = PWSTR::null();
                    args.Uri(&mut p)?;
                    args.SetHandled(true)?;
                    // WebView2 doesn't say how the tab was asked for; middle button or Ctrl held = background.
                    use windows::Win32::UI::Input::KeyboardAndMouse::VK_MBUTTON;
                    let bg = GetKeyState(VK_MBUTTON.0 as i32) < 0 || GetKeyState(VK_CONTROL.0 as i32) < 0;
                    let (a, u) = (a.clone(), take_pwstr(p));
                    std::thread::spawn(move || {
                        let p = a.state::<Mutex<State>>().lock().unwrap().private.contains(&id);
                        let _ = create_tab(&a, Some(u), bg, None, p);
                    });
                }
                Ok(())
            })),
            &mut tok,
        );

        let a = app.clone();
        let _ = ctl.add_AcceleratorKeyPressed(
            &AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
                args.KeyEventKind(&mut kind)?;
                if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
                    return Ok(());
                }
                let mut vk = 0u32;
                args.VirtualKey(&mut vk)?;
                let ctrl = GetKeyState(VK_CONTROL.0 as i32) < 0;
                let shift = GetKeyState(VK_SHIFT.0 as i32) < 0;
                let key = match (ctrl, vk) {
                    (true, 0x54) if shift => "reopen",
                    (true, 0x54) => "t",
                    (true, 0x57) => "w",
                    (true, 0x4C) => "l",
                    (true, 0x49) if shift => "dev-show",
                    (true, 0x43) if shift => "dev-pick",
                    (true, 0x4A) if shift => "dev-console",
                    (_, 0x7B) => "dev",
                    (true, 0x4A) => "j",
                    (true, 0x4E) if shift => "private",
                    (true, 0x44) => "bm",
                    (true, 0x42) if shift => "bmbar",
                    (true, 0x09) if shift => "prev",
                    (true, 0x09) => "next",
                    (true, 0x52) | (_, 0x74) => "reload",
                    (true, 0x46) => "find",
                    (true, 0x4B) => "palette",
                    (true, 0x41) if shift => "tabsearch",
                    (false, 0x1B) if shift => "tasks",
                    (false, 0x1B) if *PEEK.lock().unwrap() == Some(id) => "peek-esc",
                    _ => return Ok(()),
                };
                args.SetHandled(true)?;
                watch::crumb(format!("key {key}"));
                let _ = a.emit_to("ui", "key", key);
                Ok(())
            })),
            &mut tok,
        );
    });
}

#[cfg(windows)]
fn apply_ua(core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) {
    use webview2_com::{take_pwstr, Microsoft::Web::WebView2::Win32::ICoreWebView2Settings2};
    use windows::core::{Interface, HSTRING, PWSTR};
    unsafe {
        let Ok(s) = core.Settings().and_then(|s| s.cast::<ICoreWebView2Settings2>()) else { return };
        let mut p = PWSTR::null();
        if s.UserAgent(&mut p).is_err() {
            return;
        }
        let ua = take_pwstr(p);
        let base = ua.split(" YukiWeb/").next().unwrap_or(&ua);
        let yid = if SIGNED_IN.load(std::sync::atomic::Ordering::Relaxed) { " YukiID" } else { "" };
        let _ = s.SetUserAgent(&HSTRING::from(format!("{base} YukiWeb/{}{yid}", env!("CARGO_PKG_VERSION"))));
    }
}

#[tauri::command]
async fn set_signed_in(app: AppHandle, on: bool) {
    SIGNED_IN.store(on, std::sync::atomic::Ordering::Relaxed);
    #[cfg(windows)]
    for (l, wv) in app.webviews() {
        if l.starts_with("tab-") || l == "chat" {
            let _ = wv.with_webview(|pw| unsafe {
                if let Ok(c) = pw.controller().CoreWebView2() {
                    apply_ua(&c);
                }
            });
        }
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(not(windows))]
fn hook(_: AppHandle, _: u32, _: &Webview) {}

// Debug: Rust-side events are forwarded to the UI, which sends them to the
// server log with its own. Remove before a public release.
static APP: std::sync::OnceLock<AppHandle> = std::sync::OnceLock::new();

fn rlog(msg: String) {
    if let Some(a) = APP.get() {
        let _ = a.emit_to("ui", "rlog", msg);
    }
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let h = app.handle().clone();
    let _ = APP.set(h.clone());
    dl::load(&h);
    perm::load(&h);
    ab::load(&h);
    let mut args = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling".to_string();
    if vpn::sing_box_exe().is_some() {
        let port = vpn::stable_port(&h);
        args += &format!(" --proxy-server=socks5://127.0.0.1:{port}");
        vpn::init(&h, port);
    }
    let _ = BROWSER_ARGS.set(args);
    let u = h.clone();
    // At start, then every 3 hours (YukiWeb often stays open for days).
    std::thread::spawn(move || loop {
        match tauri::async_runtime::block_on(check_update(u.clone())) {
            Err(e) => rlog(format!("update check failed: {e}")),
            Ok(()) if u.state::<Pending>().0.lock().unwrap().is_some() => break,
            Ok(()) => {}
        }
        std::thread::sleep(std::time::Duration::from_secs(3 * 3600));
    });
    let win = WindowBuilder::new(app, "main")
        .title("YukiWeb")
        .inner_size(1280.0, 820.0)
        .min_inner_size(520.0, 360.0)
        .decorations(false)
        .build()?;
    rlog("window built".into());
    let (w, _) = win_size(&h);
    win.add_child(
        wb("ui", WebviewUrl::App("index.html".into())),
        LogicalPosition::new(0.0, 0.0),
        LogicalSize::new(w, top()),
    )?;
    rlog("ui webview added".into());
    let pop = win.add_child(
        wb("pop", WebviewUrl::App("pop.html".into())).focused(false),
        LogicalPosition::new(0.0, top()),
        LogicalSize::new(10.0, 10.0),
    )?;
    pop.hide()?;
    let panel = win.add_child(
        wb("panel", WebviewUrl::App("panel.html".into())).focused(false),
        LogicalPosition::new(0.0, top()),
        LogicalSize::new(10.0, 10.0),
    )?;
    panel.hide()?;
    watch::start(&h);
    rlog("setup done".into());
    win.on_window_event(move |e| {
        if matches!(e, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
            layout(&h);
        }
    });
    Ok(())
}

#[cfg(windows)]
fn fatal(msg: &str) {
    use windows::{core::HSTRING, Win32::UI::WindowsAndMessaging::*};
    unsafe {
        MessageBoxW(None, &HSTRING::from(msg), &HSTRING::from("YukiWeb"), MB_OK | MB_ICONERROR);
    }
}

#[cfg(not(windows))]
fn fatal(msg: &str) {
    eprintln!("{msg}");
}

fn main() {
    std::panic::set_hook(Box::new(|info| rlog(format!("PANIC {info}"))));
    *LAUNCH.lock().unwrap() = link_arg(&std::env::args().collect::<Vec<_>>());
    let app = tauri::Builder::default()
        // A second launch (a link clicked in another app) opens a tab here instead.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _| {
            if let Some(u) = link_arg(&argv) {
                let _ = app.emit_to("ui", "open", u);
            }
            if let Some(w) = app.get_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .manage(Mutex::new(State::default()))
        .manage(Pending::default())
        .manage(dl::Downloads::default())
        .manage(perm::Perms::default())
        .manage(ab::Ab::default())
        .invoke_handler(tauri::generate_handler![
            tab_new, tab_activate, tab_close, tab_nav, tab_cmd, tab_error, chat_toggle, pop_show,
            pop_hide, ui_focus, update_install, panel_show, panel_hide, set_signed_in, vpn::vpn_get, vpn::vpn_set,
            settings_show, launch_url, browser_default, browser_make_default, set_top, import_bookmarks, tab_zoom, set_sleep, clear_data, dl::dl_list, dl::dl_cancel, dl::dl_do, dl::dl_clear,
            ext::ext_install, ext::ext_list, ext::ext_toggle, ext::ext_remove, ext::ext_popup,
            perm::perm_answer, perm::perm_list, perm::perm_forget, set_lang, active_state, tools::tab_eval, tools::tab_shot, tools::save_png, tab_split, tab_peek, tab_mute, tab_sleep, proc_mem, proxy_port, chat_prewarm,
            vault::pw_list, vault::pw_reveal, vault::pw_for, vault::pw_save, vault::pw_delete, vault::pw_fill, vault::pw_import, ab::ab_get, ab::ab_set,
            dev::dev_open, dev::dev_go, dev::dev_tab, dev::dev_dock, dev::dev_resize, dev::dev_cdp, dev::dev_native,
            agent::agents_open, agent::agents_resize, agent::agent_tab, agent::agent_adopt, agent::agent_active, agent::agent_show, agent::agent_key_get, agent::agent_key_set,
            desk::desk_shot, desk::desk_input, desk::desk_reset, desk::desk_tree, desk::desk_act, desk::desk_windows, desk::desk_focus, desk::desk_open, desk::desk_cursor
        ])
        .setup(|app| {
            let r = setup(app);
            if let Err(e) = &r {
                fatal(&format!("YukiWeb couldn't start:\n\n{e}\n\nClose any leftover YukiWeb windows in Task Manager and try again."));
            }
            r
        })
        .build(tauri::generate_context!());
    let app = match app {
        Ok(a) => a,
        Err(e) => {
            fatal(&format!("YukiWeb couldn't start:\n\n{e}"));
            return;
        }
    };
    app.run(|app, ev| match ev {
        tauri::RunEvent::Exit => { ab::save(app); vpn::stop(app) }
        tauri::RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { .. }, .. } => {
            rlog(format!("close requested: {label}"));
        }
        tauri::RunEvent::ExitRequested { code, .. } => {
            rlog(format!("exit requested, code {code:?}"));
        }
        _ => {}
    });
}
