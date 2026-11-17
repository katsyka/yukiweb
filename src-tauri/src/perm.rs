// Site permissions: WebView2's prompt is replaced by our popup (panel view "perm").
// Remembered answers live in app data/perms.json as { origin: { kind: allow } }.
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};

type Saved = HashMap<String, HashMap<String, bool>>;

#[derive(Default)]
pub struct Perms(Mutex<Saved>);

#[derive(Clone, serde::Serialize)]
struct Ask {
    id: u32,
    tab: u32,
    origin: String,
    kind: &'static str,
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&d);
    Some(d.join("perms.json"))
}

pub fn load(app: &AppHandle) {
    let saved: Saved = file(app)
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    *app.state::<Perms>().0.lock().unwrap() = saved;
}

fn save(app: &AppHandle, s: &Saved) {
    if let Some(f) = file(app) {
        let _ = fs::write(f, serde_json::to_vec(s).unwrap());
    }
}

#[cfg(windows)]
thread_local! {
    // Requests waiting for the user, touched only on the main thread.
    static PENDING: std::cell::RefCell<HashMap<u32, (
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2PermissionRequestedEventArgs,
        webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Deferral,
    )>> = Default::default();
    static NEXT: std::cell::Cell<u32> = const { std::cell::Cell::new(0) };
}

#[cfg(windows)]
pub fn hook(app: AppHandle, tab: u32, core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) {
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, *};
    use windows::core::{Interface, PWSTR};
    unsafe {
        let mut tok = 0i64;
        let _ = core.add_PermissionRequested(
            &PermissionRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                let mut k = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut k)?;
                let kind = match k {
                    COREWEBVIEW2_PERMISSION_KIND_CAMERA => "camera",
                    COREWEBVIEW2_PERMISSION_KIND_MICROPHONE => "mic",
                    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION => "location",
                    COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS => "notifications",
                    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ => "clipboard",
                    COREWEBVIEW2_PERMISSION_KIND_MULTIPLE_AUTOMATIC_DOWNLOADS => "downloads",
                    COREWEBVIEW2_PERMISSION_KIND_FILE_READ_WRITE => "files",
                    COREWEBVIEW2_PERMISSION_KIND_WINDOW_MANAGEMENT => "windows",
                    COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS => "fonts",
                    COREWEBVIEW2_PERMISSION_KIND_OTHER_SENSORS => "sensors",
                    _ => return Ok(()), // autoplay etc.: WebView2's defaults are fine
                };
                let mut p = PWSTR::null();
                args.Uri(&mut p)?;
                let u = take_pwstr(p);
                let origin = u.parse::<tauri::Url>().map(|u| u.origin().ascii_serialization()).unwrap_or(u);
                // Our list is the only memory; don't let WebView2 keep its own copy.
                if let Ok(a3) = args.cast::<ICoreWebView2PermissionRequestedEventArgs3>() {
                    let _ = a3.SetSavesInProfile(false);
                }
                let known = app.state::<Perms>().0.lock().unwrap().get(&origin).and_then(|m| m.get(kind)).copied();
                if let Some(allow) = known {
                    args.SetState(if allow { COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { COREWEBVIEW2_PERMISSION_STATE_DENY })?;
                    return Ok(());
                }
                let id = NEXT.with(|n| {
                    n.set(n.get() + 1);
                    n.get()
                });
                let def = args.GetDeferral()?;
                PENDING.with(|q| q.borrow_mut().insert(id, (args.clone(), def)));
                let _ = app.emit_to("ui", "perm", Ask { id, tab, origin, kind });
                Ok(())
            })),
            &mut tok,
        );
    }
}

#[tauri::command]
pub async fn perm_answer(app: AppHandle, id: u32, origin: String, kind: String, allow: bool, remember: bool) {
    if remember {
        let st = app.state::<Perms>();
        let mut s = st.0.lock().unwrap();
        s.entry(origin).or_default().insert(kind, allow);
        save(&app, &s);
    }
    #[cfg(windows)]
    let _ = app.run_on_main_thread(move || unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        if let Some((args, def)) = PENDING.with(|q| q.borrow_mut().remove(&id)) {
            let _ = args.SetState(if allow { COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { COREWEBVIEW2_PERMISSION_STATE_DENY });
            let _ = def.Complete();
        }
    });
    #[cfg(not(windows))]
    let _ = (id, allow);
}

#[tauri::command]
pub async fn perm_list(app: AppHandle) -> Saved {
    app.state::<Perms>().0.lock().unwrap().clone()
}

// kind None forgets everything about the origin.
#[tauri::command]
pub async fn perm_forget(app: AppHandle, origin: String, kind: Option<String>) {
    let st = app.state::<Perms>();
    let mut s = st.0.lock().unwrap();
    match kind {
        Some(k) => {
            if let Some(m) = s.get_mut(&origin) {
                m.remove(&k);
                if m.is_empty() {
                    s.remove(&origin);
                }
            }
        }
        None => {
            s.remove(&origin);
        }
    }
    save(&app, &s);
}
