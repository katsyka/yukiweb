// Downloads: WebView2's own bubble is hidden and the toolbar shows ours instead.
// The list (last 50) survives restarts in app data/downloads.json.
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Dl {
    id: u32,
    name: String,
    path: String,
    url: String,
    total: i64,
    got: i64,
    // run | done | fail | cancel
    state: String,
    t: u64,
}

#[derive(Default)]
pub struct Downloads(Mutex<Vec<Dl>>);

fn file(app: &AppHandle) -> Option<PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&d);
    Some(d.join("downloads.json"))
}

pub fn load(app: &AppHandle) {
    let list: Vec<Dl> = file(app)
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    // Whatever was running when YukiWeb closed didn't finish.
    let list = list
        .into_iter()
        .map(|mut d| {
            if d.state == "run" {
                d.state = "fail".into();
            }
            d
        })
        .collect();
    *app.state::<Downloads>().0.lock().unwrap() = list;
}

fn save(app: &AppHandle, list: &[Dl]) {
    if let Some(f) = file(app) {
        let _ = fs::write(f, serde_json::to_vec(list).unwrap());
    }
}

// Update one entry, tell the chrome, and persist when it finished.
fn put(app: &AppHandle, d: Dl) {
    let st = app.state::<Downloads>();
    let mut list = st.0.lock().unwrap();
    match list.iter_mut().find(|x| x.id == d.id) {
        Some(x) => *x = d.clone(),
        None => {
            list.insert(0, d.clone());
            list.truncate(50);
        }
    }
    if d.state != "run" {
        save(app, &list);
    }
    let _ = app.emit("dl", d);
}

#[cfg(windows)]
thread_local! {
    // Live operations, touched only on the main thread (WebView2 objects aren't Send).
    static OPS: std::cell::RefCell<std::collections::HashMap<u32, webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2DownloadOperation>> = Default::default();
}

#[cfg(windows)]
pub fn hook(app: AppHandle, core: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2) {
    use std::{cell::Cell, rc::Rc, time::Instant};
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, *};
    use windows::core::{Interface, PWSTR};
    unsafe {
        let Ok(c4) = core.cast::<ICoreWebView2_4>() else { return };
        let mut tok = 0i64;
        let _ = c4.add_DownloadStarting(
            &DownloadStartingEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                args.SetHandled(true)?;
                let op = args.DownloadOperation()?;
                let mut p = PWSTR::null();
                args.ResultFilePath(&mut p)?;
                let path = take_pwstr(p);
                op.Uri(&mut p)?;
                let url = take_pwstr(p);
                let mut total = 0i64;
                let _ = op.TotalBytesToReceive(&mut total);
                let id = app.state::<Downloads>().0.lock().unwrap().iter().map(|d| d.id).max().unwrap_or(0) + 1;
                let d = Dl {
                    id,
                    name: std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into()).unwrap_or_default(),
                    path,
                    url,
                    total,
                    got: 0,
                    state: "run".into(),
                    t: std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
                };
                put(&app, d.clone());
                OPS.with(|o| o.borrow_mut().insert(id, op.clone()));

                let cur = Rc::new(std::cell::RefCell::new(d));
                let last = Rc::new(Cell::new(Instant::now()));
                let (a, c) = (app.clone(), cur.clone());
                let mut t = 0i64;
                let _ = op.add_BytesReceivedChanged(
                    &BytesReceivedChangedEventHandler::create(Box::new(move |s, _| {
                        // ~4 updates a second is plenty for a progress ring.
                        if last.get().elapsed().as_millis() < 250 {
                            return Ok(());
                        }
                        last.set(Instant::now());
                        if let Some(s) = s {
                            let mut d = c.borrow_mut();
                            s.BytesReceived(&mut d.got)?;
                            s.TotalBytesToReceive(&mut d.total)?;
                            put(&a, d.clone());
                        }
                        Ok(())
                    })),
                    &mut t,
                );
                let (a, c) = (app.clone(), cur);
                let _ = op.add_StateChanged(
                    &StateChangedEventHandler::create(Box::new(move |s, _| {
                        let Some(s) = s else { return Ok(()) };
                        let mut st = COREWEBVIEW2_DOWNLOAD_STATE::default();
                        s.State(&mut st)?;
                        let mut d = c.borrow_mut();
                        d.state = match st {
                            COREWEBVIEW2_DOWNLOAD_STATE_COMPLETED => "done",
                            COREWEBVIEW2_DOWNLOAD_STATE_INTERRUPTED => {
                                let mut r = COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON::default();
                                let _ = s.InterruptReason(&mut r);
                                if r == COREWEBVIEW2_DOWNLOAD_INTERRUPT_REASON_USER_CANCELED { "cancel" } else { "fail" }
                            }
                            _ => "run",
                        }
                        .into();
                        let _ = s.BytesReceived(&mut d.got);
                        // The final name can differ from the one picked at the start ("file (1).zip").
                        let mut p = PWSTR::null();
                        if s.ResultFilePath(&mut p).is_ok() {
                            let path = take_pwstr(p);
                            if !path.is_empty() {
                                d.name = std::path::Path::new(&path).file_name().map(|n| n.to_string_lossy().into()).unwrap_or_default();
                                d.path = path;
                            }
                        }
                        if d.state != "run" {
                            let id = d.id;
                            OPS.with(|o| o.borrow_mut().remove(&id));
                        }
                        put(&a, d.clone());
                        Ok(())
                    })),
                    &mut t,
                );
                Ok(())
            })),
            &mut tok,
        );
    }
}

#[tauri::command]
pub async fn dl_list(app: AppHandle) -> Vec<Dl> {
    app.state::<Downloads>().0.lock().unwrap().clone()
}

#[tauri::command]
pub async fn dl_cancel(app: AppHandle, id: u32) {
    #[cfg(windows)]
    let _ = app.run_on_main_thread(move || {
        OPS.with(|o| {
            if let Some(op) = o.borrow().get(&id) {
                let _ = unsafe { op.Cancel() };
            }
        })
    });
    #[cfg(not(windows))]
    let _ = (app, id);
}

// what: open (the file) | show (in its folder) | forget (drop from the list)
#[tauri::command]
pub async fn dl_do(app: AppHandle, id: u32, what: String) -> Result<(), String> {
    let st = app.state::<Downloads>();
    let mut list = st.0.lock().unwrap();
    let Some(i) = list.iter().position(|d| d.id == id) else { return Err("gone".into()) };
    let path = list[i].path.clone();
    match what.as_str() {
        "forget" => {
            list.remove(i);
            save(&app, &list);
            Ok(())
        }
        _ if !std::path::Path::new(&path).exists() => Err("File was moved or deleted".into()),
        "open" => std::process::Command::new("explorer").arg(&path).spawn().map(|_| ()).map_err(|e| e.to_string()),
        _ => std::process::Command::new("explorer").arg(format!("/select,{path}")).spawn().map(|_| ()).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn dl_clear(app: AppHandle) {
    let st = app.state::<Downloads>();
    let mut list = st.0.lock().unwrap();
    list.retain(|d| d.state == "run");
    save(&app, &list);
}
