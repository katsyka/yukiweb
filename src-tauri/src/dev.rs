// Yuki DevTools: our own panel (src/dev.html, webview "dev") docked under the page.
// It drives the active tab over the DevTools protocol: dev_cdp calls a method, and the
// events listed in EVENTS are forwarded to the panel as "cdp" (tab id, method, params JSON).
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering::Relaxed},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

static OPEN: AtomicBool = AtomicBool::new(false);
static HEIGHT: AtomicU32 = AtomicU32::new(320);
// Dock side like Chrome: 0 bottom, 1 right, 2 left. WIDTH is the size when docked to a side.
// Saved in app data/devtools.json.
static DOCK: AtomicU32 = AtomicU32::new(1);
static WIDTH: AtomicU32 = AtomicU32::new(520);
static LOADED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize, serde::Deserialize)]
struct Cfg { dock: u32, height: u32, width: u32 }

fn cfg_file(app: &AppHandle) -> Option<std::path::PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&d);
    Some(d.join("devtools.json"))
}
fn cfg_load(app: &AppHandle) {
    if LOADED.swap(true, Relaxed) { return; }
    if let Some(c) = cfg_file(app).and_then(|f| std::fs::read(f).ok()).and_then(|b| serde_json::from_slice::<Cfg>(&b).ok()) {
        DOCK.store(c.dock.min(2), Relaxed);
        HEIGHT.store(c.height, Relaxed);
        WIDTH.store(c.width, Relaxed);
    }
}
fn cfg_save(app: &AppHandle) {
    let c = Cfg { dock: DOCK.load(Relaxed), height: HEIGHT.load(Relaxed), width: WIDTH.load(Relaxed) };
    if let Some(f) = cfg_file(app) { let _ = std::fs::write(f, serde_json::to_vec(&c).unwrap()); }
}
const DOCKS: [&str; 3] = ["bottom", "right", "left"];
// What a panel that is still loading should do once it calls dev_tab (pick, inspect, a pane).
static PENDING: Mutex<Option<String>> = Mutex::new(None);
static LAST: AtomicU32 = AtomicU32::new(0);
static ATTACHED: Mutex<Option<HashSet<u32>>> = Mutex::new(None);

const EVENTS: &[&str] = &[
    "Runtime.consoleAPICalled",
    "Runtime.exceptionThrown",
    "Log.entryAdded",
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.loadingFinished",
    "Network.loadingFailed",
    "Network.requestServedFromCache",
    "Page.frameNavigated",
    "Overlay.inspectNodeRequested",
    "Overlay.inspectModeCanceled",
    "DOM.documentUpdated",
    "DOM.setChildNodes",
    "DOM.childNodeInserted",
    "DOM.childNodeRemoved",
    "DOM.childNodeCountUpdated",
    "DOM.attributeModified",
    "DOM.attributeRemoved",
    "DOM.characterDataModified",
];
const ENABLE: &[&str] = &["Runtime.enable", "Log.enable", "Network.enable", "Page.enable", "DOM.enable", "CSS.enable", "Overlay.enable", "Performance.enable"];

pub fn open() -> bool {
    OPEN.load(Relaxed)
}

/// Space the page gives up to the panel: (left, right, bottom), all 0 when closed.
pub fn inset() -> (f64, f64, f64) {
    if !open() { return (0.0, 0.0, 0.0); }
    let (w, h) = (WIDTH.load(Relaxed) as f64, HEIGHT.load(Relaxed) as f64);
    match DOCK.load(Relaxed) { 1 => (0.0, w, 0.0), 2 => (w, 0.0, 0.0), _ => (0.0, 0.0, h) }
}

pub fn place(app: &AppHandle, full: bool) {
    let Some(wv) = app.get_webview("dev") else { return };
    if !open() || full {
        let _ = wv.hide();
        return;
    }
    let (w, h) = crate::win_size(app);
    let w = w - crate::agent::width();
    let t = crate::top();
    let (l, r, b) = inset();
    let (pos, size) = match DOCK.load(Relaxed) {
        1 => (LogicalPosition::new(w - r, t), LogicalSize::new(r, h - t)),
        2 => (LogicalPosition::new(0.0, t), LogicalSize::new(l, h - t)),
        _ => (LogicalPosition::new(0.0, h - b), LogicalSize::new(w, b)),
    };
    let _ = wv.set_position(pos);
    let _ = wv.set_size(size);
    let _ = wv.show();
}

/// Starts forwarding a tab's protocol events (once per tab) and tells the panel which tab it's on.
pub fn attach(app: &AppHandle, id: u32) {
    if !open() || id == 0 {
        return;
    }
    let prev = LAST.swap(id, Relaxed);
    if prev != 0 && prev != id {
        unhighlight(app, prev);
    }
    let _ = app.emit_to("dev", "dev-tab", id);
    let fresh = ATTACHED.lock().unwrap().get_or_insert_with(HashSet::new).insert(id);
    let Some(wv) = app.get_webview(&crate::label(id)) else { return };
    if !fresh {
        return;
    }
    let a = app.clone();
    let _ = wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        {
            use webview2_com::{take_pwstr, CallDevToolsProtocolMethodCompletedHandler, DevToolsProtocolEventReceivedEventHandler};
            use windows::core::{HSTRING, PWSTR};
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            for &ev in EVENTS {
                let Ok(rx) = core.GetDevToolsProtocolEventReceiver(&HSTRING::from(ev)) else { continue };
                let a = a.clone();
                let mut tok = 0i64;
                let _ = rx.add_DevToolsProtocolEventReceived(
                    &DevToolsProtocolEventReceivedEventHandler::create(Box::new(move |_, args| {
                        // Closed panel: nothing is recorded (like Chrome's DevTools).
                        let Some(args) = args.filter(|_| open()) else { return Ok(()) };
                        let mut p = PWSTR::null();
                        args.ParameterObjectAsJson(&mut p)?;
                        let _ = a.emit_to("dev", "cdp", (id, ev, take_pwstr(p)));
                        Ok(())
                    })),
                    &mut tok,
                );
            }
            for &m in ENABLE {
                let _ = core.CallDevToolsProtocolMethod(
                    &HSTRING::from(m),
                    &HSTRING::from("{}"),
                    &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(()))),
                );
            }
        }
        #[cfg(not(windows))]
        let _ = (pw, a);
    });
}

// Fire-and-forget protocol call on a tab.
fn fire(app: &AppHandle, id: u32, method: &'static str, params: &'static str) {
    let Some(wv) = app.get_webview(&crate::label(id)) else { return };
    let _ = wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        if let Ok(core) = pw.controller().CoreWebView2() {
            use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
            use windows::core::HSTRING;
            let _ = core.CallDevToolsProtocolMethod(
                &HSTRING::from(method),
                &HSTRING::from(params),
                &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(()))),
            );
        }
        #[cfg(not(windows))]
        let _ = (pw, method, params);
    });
}

/// Element picker off and no highlight left on the page.
fn unhighlight(app: &AppHandle, id: u32) {
    fire(app, id, "Overlay.setInspectMode", r#"{"mode":"none","highlightConfig":{}}"#);
    fire(app, id, "Overlay.hideHighlight", "{}");
}

pub fn forget(id: u32) {
    if let Some(s) = ATTACHED.lock().unwrap().as_mut() {
        s.remove(&id);
    }
}

#[tauri::command]
pub async fn dev_open(app: AppHandle, open: bool) -> Result<(), String> {
    cfg_load(&app);
    crate::watch::crumb(format!("dev_open {open}"));
    OPEN.store(open, Relaxed);
    let fresh = open && app.get_webview("dev").is_none();
    if fresh {
        let win = app.get_window("main").ok_or("no window")?;
        let (w, h) = crate::win_size(&app);
        let wv = win
            .add_child(crate::wb("dev", WebviewUrl::App("dev.html".into())), LogicalPosition::new(0.0, h - 300.0), LogicalSize::new(w, 300.0))
            .map_err(|e| e.to_string())?;
        // F12, Ctrl+F, Ctrl+P… belong to dev.html's own handlers, not Chromium's.
        let _ = wv.with_webview(|pw| unsafe {
            #[cfg(windows)]
            {
                use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
                use windows::core::Interface;
                if let Ok(s) = pw.controller().CoreWebView2().and_then(|c| c.Settings()).and_then(|s| s.cast::<ICoreWebView2Settings3>()) {
                    let _ = s.SetAreBrowserAcceleratorKeysEnabled(false);
                }
            }
            #[cfg(not(windows))]
            let _ = pw;
        });
    }
    crate::layout(&app);
    // A new panel calls dev_tab once it's listening, so the console history isn't missed.
    if open && !fresh {
        let id = app.state::<Mutex<crate::State>>().lock().unwrap().active;
        attach(&app, id);
    } else if !open {
        let ids: Vec<u32> = ATTACHED.lock().unwrap().iter().flatten().copied().collect();
        for id in ids {
            unhighlight(&app, id);
        }
        let _ = app.emit_to("dev", "dev-closed", ());
        if let Some(wv) = app.get_webview(&crate::label(app.state::<Mutex<crate::State>>().lock().unwrap().active)) {
            let _ = wv.set_focus();
        }
    }
    let _ = app.emit_to("ui", "dev-open", open);
    Ok(())
}

/// The panel is ready: which tab is it looking at, and anything it was asked to do meanwhile.
#[tauri::command]
pub async fn dev_tab(app: AppHandle) -> (u32, Option<String>, &'static str) {
    let id = app.state::<Mutex<crate::State>>().lock().unwrap().active;
    attach(&app, id);
    (id, PENDING.lock().unwrap().take(), DOCKS[DOCK.load(Relaxed) as usize])
}

#[tauri::command]
pub async fn dev_dock(app: AppHandle, side: String) -> &'static str {
    if let Some(i) = DOCKS.iter().position(|d| *d == side) {
        DOCK.store(i as u32, Relaxed);
        cfg_save(&app);
        crate::layout(&app);
    }
    let d = DOCKS[DOCK.load(Relaxed) as usize];
    let _ = app.emit_to("dev", "dev-dock", d);
    d
}

/// Opens the panel and sends it to a pane or action (pick, inspect, con...).
#[tauri::command]
pub async fn dev_go(app: AppHandle, what: String) -> Result<(), String> {
    let loaded = app.get_webview("dev").is_some();
    if !loaded {
        *PENDING.lock().unwrap() = Some(what.clone());
    }
    dev_open(app.clone(), true).await?;
    if loaded {
        let _ = app.emit_to("dev", "dev-go", what);
    }
    Ok(())
}

#[tauri::command]
pub async fn dev_resize(app: AppHandle, size: f64, done: Option<bool>) {
    let (ww, wh) = crate::win_size(&app);
    if DOCK.load(Relaxed) == 0 {
        HEIGHT.store(size.clamp(120.0, (wh - crate::top() - 80.0).max(120.0)) as u32, Relaxed);
    } else {
        WIDTH.store(size.clamp(280.0, (ww - 300.0).max(280.0)) as u32, Relaxed);
    }
    crate::layout(&app);
    if done == Some(true) { cfg_save(&app); }
}

#[tauri::command]
pub async fn dev_cdp(app: AppHandle, id: u32, method: String, params: Option<String>) -> Result<serde_json::Value, String> {
    let wv = app.get_webview(&crate::label(id)).ok_or("no tab")?;
    crate::tools::devtools(&wv, &method, params.unwrap_or_else(|| "{}".into()))
}

/// The full Chromium DevTools in their own window.
#[tauri::command]
pub async fn dev_native(app: AppHandle, id: u32) -> Result<(), String> {
    let wv = app.get_webview(&crate::label(id)).ok_or("no tab")?;
    wv.with_webview(|pw| unsafe {
        #[cfg(windows)]
        if let Ok(core) = pw.controller().CoreWebView2() {
            let _ = core.OpenDevToolsWindow();
        }
        #[cfg(not(windows))]
        let _ = pw;
    })
    .map_err(|e| e.to_string())
}
