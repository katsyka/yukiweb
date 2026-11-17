// Agents mode: a panel (src/agents.html, webview "agents") docked on the right of the page.
// Agent tabs are normal tabs, but when you're not looking at them they stay "visible" off-screen
// (not hidden) so Chromium keeps painting them: agents need screenshots and real input.
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering::Relaxed},
        Mutex,
    },
};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

static OPEN: AtomicBool = AtomicBool::new(false);
static WIDTH: AtomicU32 = AtomicU32::new(480);
static TABS: Mutex<Option<HashSet<u32>>> = Mutex::new(None);
// Agent tabs render at this size while off-screen.
pub const OFF_W: f64 = 1280.0;
pub const OFF_H: f64 = 800.0;

pub fn is_agent(id: u32) -> bool {
    TABS.lock().unwrap().as_ref().map_or(false, |s| s.contains(&id))
}

/// Width the page gives up on the right.
pub fn width() -> f64 {
    if OPEN.load(Relaxed) { WIDTH.load(Relaxed) as f64 } else { 0.0 }
}

pub fn place(app: &AppHandle, full: bool) {
    let Some(wv) = app.get_webview("agents") else { return };
    if !OPEN.load(Relaxed) || full {
        let _ = wv.hide();
        return;
    }
    let (w, h) = crate::win_size(app);
    let t = crate::top();
    let r = width();
    let _ = wv.set_position(LogicalPosition::new(w - r, t));
    let _ = wv.set_size(LogicalSize::new(r, h - t));
    let _ = wv.show();
}

pub fn forget(id: u32) {
    if let Some(s) = TABS.lock().unwrap().as_mut() {
        s.remove(&id);
    }
}

#[tauri::command]
pub async fn agents_open(app: AppHandle, open: bool) -> Result<(), String> {
    OPEN.store(open, Relaxed);
    if open && app.get_webview("agents").is_none() {
        let win = app.get_window("main").ok_or("no window")?;
        let (w, h) = crate::win_size(&app);
        win.add_child(crate::wb("agents", WebviewUrl::App("agents.html".into())), LogicalPosition::new(w - 480.0, crate::top()), LogicalSize::new(480.0, h - crate::top()))
            .map_err(|e| e.to_string())?;
    }
    crate::layout(&app);
    let _ = app.emit_to("ui", "agents-open", open);
    Ok(())
}

#[tauri::command]
pub async fn agents_resize(app: AppHandle, size: f64) {
    let (ww, _) = crate::win_size(&app);
    WIDTH.store(size.clamp(320.0, (ww - 360.0).max(320.0)) as u32, Relaxed);
    crate::layout(&app);
}

/// A new background tab that an agent drives. `private` = a clean profile (no logins).
#[tauri::command]
pub async fn agent_tab(app: AppHandle, url: String, private: bool, name: String, color: String) -> Result<u32, String> {
    let id = crate::create_tab(&app, Some(url), true, None, private)?;
    TABS.lock().unwrap().get_or_insert_with(HashSet::new).insert(id);
    // Off-screen first, then visible: Chromium only paints (and screenshots) shown webviews.
    crate::layout(&app);
    if let Some(wv) = app.get_webview(&crate::label(id)) {
        let _ = wv.show();
        crate::background(&wv, false);
    }
    let _ = app.emit_to("ui", "agent-tab", (id, name, color));
    Ok(id)
}

/// Lets an agent work in a tab you already have open (or gives it back).
#[tauri::command]
pub async fn agent_adopt(app: AppHandle, id: u32, on: bool, name: String, color: String) {
    {
        let mut g = TABS.lock().unwrap();
        let s = g.get_or_insert_with(HashSet::new);
        if on { s.insert(id); } else { s.remove(&id); }
    }
    crate::layout(&app);
    let _ = app.emit_to("ui", "agent-mark", (id, on, name, color));
}

#[tauri::command]
pub async fn agent_active(app: AppHandle) -> u32 {
    app.state::<Mutex<crate::State>>().lock().unwrap().active
}

/// Shows an agent's tab to the user.
#[tauri::command]
pub async fn agent_show(app: AppHandle, id: u32) {
    let _ = app.emit_to("ui", "agent-show", id);
}

// The Gemini key, encrypted for this Windows user (DPAPI), in app data/agentkey.bin.
fn key_file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(&d);
    Ok(d.join("agentkey.bin"))
}

#[tauri::command]
pub async fn agent_key_get(app: AppHandle) -> Result<String, String> {
    let Ok(raw) = std::fs::read(key_file(&app)?) else { return Ok(String::new()) };
    String::from_utf8(crate::vault::dpapi(&raw, false)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn agent_key_set(app: AppHandle, key: String) -> Result<(), String> {
    let f = key_file(&app)?;
    if key.is_empty() {
        let _ = std::fs::remove_file(f);
        return Ok(());
    }
    std::fs::write(f, crate::vault::dpapi(key.as_bytes(), true)?).map_err(|e| e.to_string())
}

pub fn any() -> bool {
    TABS.lock().unwrap().as_ref().map_or(false, |s| !s.is_empty())
}
