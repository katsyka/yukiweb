// Chrome extensions: the UI downloads a .crx from the Chrome Web Store and hands us the bytes;
// we unpack it into app data/extensions/<store id> and register the folder with WebView2,
// which keeps it in the profile. Our list (app data/extensions.json) adds what WebView2 doesn't
// know: popup/options pages and an icon for the toolbar.
use std::{fs, path::PathBuf, sync::mpsc, time::Duration};
use tauri::{ipc::Request, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Ext {
    id: String, // WebView2's id (chrome-extension://<id>/)
    cws: String,
    name: String,
    ver: String,
    popup: String,
    options: String,
    icon: String, // data: URL
    on: bool,
}

fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(d)
}

fn load(app: &AppHandle) -> Vec<Ext> {
    root(app)
        .ok()
        .and_then(|d| fs::read(d.join("extensions.json")).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn save(app: &AppHandle, list: &[Ext]) {
    if let Ok(d) = root(app) {
        let _ = fs::write(d.join("extensions.json"), serde_json::to_vec(list).unwrap());
    }
}

// .crx = "Cr24" + version + header(s) + zip. Accept a bare zip too.
fn crx_zip(b: &[u8]) -> Result<&[u8], String> {
    let u = |i: usize| u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]]) as usize;
    if b.starts_with(b"PK") {
        return Ok(b);
    }
    if b.len() < 16 || !b.starts_with(b"Cr24") {
        return Err("That isn't an extension package".into());
    }
    let off = match u(4) {
        3 => 12 + u(8),
        2 => 16 + u(8) + u(12),
        v => return Err(format!("Unknown package version {v}")),
    };
    b.get(off..).ok_or_else(|| "Broken extension package".into())
}

// "__MSG_appName__" → the default locale's message.
fn msg(dir: &std::path::Path, m: &serde_json::Value, s: &str) -> String {
    let Some(key) = s.strip_prefix("__MSG_").and_then(|k| k.strip_suffix("__")) else { return s.into() };
    let loc = m["default_locale"].as_str().unwrap_or("en");
    let Ok(b) = fs::read(dir.join("_locales").join(loc).join("messages.json")) else { return s.into() };
    let Ok(j) = serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(&b) else { return s.into() };
    j.iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .and_then(|(_, v)| v["message"].as_str())
        .unwrap_or(s)
        .into()
}

fn describe(dir: &std::path::Path, cws: &str) -> Result<Ext, String> {
    use base64::Engine;
    let m: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("manifest.json")).map_err(|_| "No manifest.json in the package")?)
        .map_err(|e| e.to_string())?;
    let s = |v: &serde_json::Value| v.as_str().unwrap_or("").trim_start_matches('/').to_string();
    let act = if m["action"].is_object() { &m["action"] } else { &m["browser_action"] };
    // The smallest icon that still looks fine at 16–20px.
    let icon = m["icons"]
        .as_object()
        .and_then(|o| {
            let mut v: Vec<_> = o.iter().filter_map(|(k, p)| Some((k.parse::<u32>().ok()?, p.as_str()?))).collect();
            v.sort();
            v.iter().find(|(k, _)| *k >= 32).or(v.last()).map(|(_, p)| p.trim_start_matches('/').to_string())
        })
        .and_then(|p| fs::read(dir.join(&p)).ok().map(|b| (p, b)))
        .map(|(p, b)| {
            let mime = if p.ends_with(".svg") { "image/svg+xml" } else { "image/png" };
            format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(b))
        })
        .unwrap_or_default();
    Ok(Ext {
        id: String::new(),
        cws: cws.into(),
        name: msg(dir, &m, m["name"].as_str().unwrap_or(cws)),
        ver: s(&m["version"]),
        popup: s(&act["default_popup"]),
        options: if m["options_ui"]["page"].is_string() { s(&m["options_ui"]["page"]) } else { s(&m["options_page"]) },
        icon,
        on: true,
    })
}

// Run `f` with the shared WebView2 profile on the main thread and wait for its callback.
#[cfg(windows)]
fn with_profile<T: Send + 'static>(
    app: &AppHandle,
    f: impl FnOnce(webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Profile7, mpsc::Sender<Result<T, String>>) + Send + 'static,
) -> Result<T, String> {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;
    let (tx, rx) = mpsc::channel();
    let ui = app.get_webview("ui").ok_or("no ui")?;
    let t = tx.clone();
    ui.with_webview(move |pw| unsafe {
        let p = pw
            .controller()
            .CoreWebView2()
            .and_then(|c| c.cast::<ICoreWebView2_13>())
            .and_then(|c| c.Profile())
            .and_then(|p| p.cast::<ICoreWebView2Profile7>());
        match p {
            Ok(p) => f(p, t),
            Err(_) => {
                let _ = t.send(Err("Your WebView2 is too old for extensions; update Microsoft Edge".into()));
            }
        }
    })
    .map_err(|e| e.to_string())?;
    drop(tx);
    rx.recv_timeout(Duration::from_secs(30)).map_err(|_| "Timed out".to_string())?
}

// Find our extension in WebView2's list and act on it.
#[cfg(windows)]
fn with_ext(
    app: &AppHandle,
    id: String,
    f: impl FnOnce(webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2BrowserExtension, mpsc::Sender<Result<(), String>>) + Send + 'static,
) -> Result<(), String> {
    use webview2_com::{take_pwstr, ProfileGetBrowserExtensionsCompletedHandler};
    use windows::core::PWSTR;
    with_profile(app, move |p, tx| unsafe {
        let mut f = Some(f);
        let t = tx.clone();
        let r = p.GetBrowserExtensions(&ProfileGetBrowserExtensionsCompletedHandler::create(Box::new(move |_, list| {
            let Some(list) = list else { return Ok(()) };
            let mut n = 0u32;
            list.Count(&mut n)?;
            for i in 0..n {
                let e = list.GetValueAtIndex(i)?;
                let mut p = PWSTR::null();
                e.Id(&mut p)?;
                if take_pwstr(p) == id {
                    if let Some(f) = f.take() {
                        f(e, t.clone());
                    }
                    return Ok(());
                }
            }
            let _ = t.send(Err("Extension not found".into()));
            Ok(())
        })));
        if r.is_err() {
            let _ = tx.send(Err("Couldn't list extensions".into()));
        }
    })
}

// Body: the .crx bytes. Header x-cws: the store id.
#[tauri::command]
pub async fn ext_install(app: AppHandle, request: Request<'_>) -> Result<Ext, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else { return Err("No package".into()) };
    let cws: String = request.headers().get("x-cws").and_then(|v| v.to_str().ok()).unwrap_or("").chars().filter(|c| c.is_ascii_alphanumeric()).collect();
    if cws.is_empty() {
        return Err("No extension id".into());
    }
    let dir = root(&app)?.join("extensions").join(&cws);
    let mut list = load(&app);
    // Reinstall = update: drop the old copy first.
    if let Some(old) = list.iter().position(|e| e.cws == cws) {
        let o = list.remove(old);
        #[cfg(windows)]
        let _ = with_ext(&app, o.id, |e, tx| unsafe {
            let _ = e.Remove(&webview2_com::BrowserExtensionRemoveCompletedHandler::create(Box::new(move |_| {
                let _ = tx.send(Ok(()));
                Ok(())
            })));
        });
        #[cfg(not(windows))]
        let _ = o;
    }
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    zip::ZipArchive::new(std::io::Cursor::new(crx_zip(bytes)?))
        .and_then(|mut z| z.extract(&dir))
        .map_err(|e| format!("Couldn't unpack: {e}"))?;
    let mut ext = describe(&dir, &cws)?;
    #[cfg(windows)]
    {
        use webview2_com::{take_pwstr, ProfileAddBrowserExtensionCompletedHandler};
        use windows::core::{HSTRING, PWSTR};
        let path = HSTRING::from(dir.to_string_lossy().as_ref());
        ext.id = with_profile(&app, move |p, tx| unsafe {
            let t = tx.clone();
            let r = p.AddBrowserExtension(
                &path,
                &ProfileAddBrowserExtensionCompletedHandler::create(Box::new(move |hr, e| {
                    let res = match (hr.is_ok(), e) {
                        (true, Some(e)) => {
                            let mut p = PWSTR::null();
                            e.Id(&mut p).map(|_| take_pwstr(p)).map_err(|e| e.to_string())
                        }
                        _ => Err(format!("WebView2 refused the extension ({hr:?})")),
                    };
                    let _ = t.send(res);
                    Ok(())
                })),
            );
            if let Err(e) = r {
                let _ = tx.send(Err(e.to_string()));
            }
        })?;
    }
    list.push(ext.clone());
    save(&app, &list);
    let _ = app.emit("ext", load(&app));
    Ok(ext)
}

#[tauri::command]
pub async fn ext_list(app: AppHandle) -> Vec<Ext> {
    load(&app)
}

#[tauri::command]
pub async fn ext_toggle(app: AppHandle, id: String, on: bool) -> Result<(), String> {
    #[cfg(windows)]
    with_ext(&app, id.clone(), move |e, tx| unsafe {
        let _ = e.Enable(on, &webview2_com::BrowserExtensionEnableCompletedHandler::create(Box::new(move |_| {
            let _ = tx.send(Ok(()));
            Ok(())
        })));
    })?;
    let mut list = load(&app);
    if let Some(e) = list.iter_mut().find(|e| e.id == id) {
        e.on = on;
    }
    save(&app, &list);
    let _ = app.emit("ext", list);
    Ok(())
}

#[tauri::command]
pub async fn ext_remove(app: AppHandle, id: String) -> Result<(), String> {
    #[cfg(windows)]
    let _ = with_ext(&app, id.clone(), |e, tx| unsafe {
        let _ = e.Remove(&webview2_com::BrowserExtensionRemoveCompletedHandler::create(Box::new(move |_| {
            let _ = tx.send(Ok(()));
            Ok(())
        })));
    });
    let mut list = load(&app);
    if let Some(i) = list.iter().position(|e| e.id == id) {
        let e = list.remove(i);
        let _ = fs::remove_dir_all(root(&app)?.join("extensions").join(&e.cws));
    }
    save(&app, &list);
    let _ = app.emit("ext", list);
    Ok(())
}

// An extension's popup in its own small webview under the toolbar; it hides when it loses focus.
#[tauri::command]
pub async fn ext_popup(app: AppHandle, id: String, right: f64) -> Result<(), String> {
    let list = load(&app);
    let e = list.iter().find(|e| e.id == id).ok_or("gone")?;
    let url = format!("chrome-extension://{}/{}", e.id, e.popup).parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let (w, h) = crate::win_size(&app);
    let pos = LogicalPosition::new((right - 380.0).clamp(8.0, (w - 388.0).max(8.0)), crate::top() - 2.0);
    let size = LogicalSize::new(380.0, (h - crate::top() - 8.0).min(560.0));
    if let Some(p) = app.get_webview("extpop") {
        let _ = p.close();
    }
    let win = app.get_window("main").ok_or("no window")?;
    let p = win.add_child(crate::wb("extpop", WebviewUrl::External(url)), pos, size).map_err(|e| e.to_string())?;
    crate::front(&p);
    let _ = p.set_focus();
    #[cfg(windows)]
    {
        let a = app.clone();
        let _ = p.with_webview(move |pw| unsafe {
            let mut tok = 0i64;
            let _ = pw.controller().add_LostFocus(
                &webview2_com::FocusChangedEventHandler::create(Box::new(move |_, _| {
                    if let Some(p) = a.get_webview("extpop") {
                        let _ = p.hide();
                    }
                    Ok(())
                })),
                &mut tok,
            );
        });
    }
    Ok(())
}
