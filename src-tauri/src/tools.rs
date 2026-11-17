// Page tools (find, reader, translate, notes, screenshots): the UI runs code in a tab and
// reads the answer, or asks Chromium (DevTools protocol) for a screenshot.
use base64::Engine;
use tauri::{AppHandle, Manager, Webview};

// Runs `js` in the tab's page and returns the result as JSON text ("null" for nothing).
#[tauri::command]
pub async fn tab_eval(app: AppHandle, id: u32, js: String) -> Result<String, String> {
    let wv = app.get_webview(&crate::label(id)).ok_or("no tab")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        {
            use webview2_com::ExecuteScriptCompletedHandler;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            let _ = core.ExecuteScript(
                &windows::core::HSTRING::from(js),
                &ExecuteScriptCompletedHandler::create(Box::new(move |_, r| {
                    let _ = tx.send(r);
                    Ok(())
                })),
            );
        }
        #[cfg(not(windows))]
        let _ = (pw, tx, js);
    })
    .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(30)).map_err(|_| "The page didn't answer".to_string())
}

pub(crate) fn devtools(wv: &Webview, method: &str, params: String) -> Result<serde_json::Value, String> {
    let (tx, rx) = std::sync::mpsc::channel::<Result<String, String>>();
    let method = method.to_string();
    wv.with_webview(move |pw| unsafe {
        #[cfg(windows)]
        {
            use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
            use windows::core::HSTRING;
            let Ok(core) = pw.controller().CoreWebView2() else { return };
            let _ = core.CallDevToolsProtocolMethod(
                &HSTRING::from(method),
                &HSTRING::from(params),
                &CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |e, r| {
                    let _ = tx.send(e.map(|_| r).map_err(|e| e.to_string()));
                    Ok(())
                })),
            );
        }
        #[cfg(not(windows))]
        let _ = (pw, tx, method, params);
    })
    .map_err(|e| e.to_string())?;
    let r = rx.recv_timeout(std::time::Duration::from_secs(30)).map_err(|_| "The page didn't answer".to_string())??;
    serde_json::from_str(&r).map_err(|e| e.to_string())
}

// PNG as base64: the visible part, or the whole page (capped at 16000 px tall).
#[tauri::command]
pub async fn tab_shot(app: AppHandle, id: u32, full: bool) -> Result<String, String> {
    let wv = app.get_webview(&crate::label(id)).ok_or("no tab")?;
    let params = if full {
        let m = devtools(&wv, "Page.getLayoutMetrics", "{}".into())?;
        let size = &m["cssContentSize"];
        let (w, h) = (size["width"].as_f64().unwrap_or(1280.0), size["height"].as_f64().unwrap_or(800.0));
        serde_json::json!({ "format": "png", "captureBeyondViewport": true,
            "clip": { "x": 0, "y": 0, "width": w, "height": h.min(16000.0), "scale": 1 } })
    } else {
        serde_json::json!({ "format": "png" })
    };
    let r = devtools(&wv, "Page.captureScreenshot", params.to_string())?;
    r["data"].as_str().map(str::to_string).ok_or("No picture".into())
}

// Saves a screenshot into Downloads and shows it in Explorer.
#[tauri::command]
pub async fn save_png(app: AppHandle, b64: String, name: String) -> Result<String, String> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let safe: String = name.chars().map(|c| if c.is_alphanumeric() || " -_.".contains(c) { c } else { '_' }).collect();
    let path = dir.join(format!("{safe}.png"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let p = path.to_string_lossy().to_string();
    let _ = std::process::Command::new("explorer").arg(format!("/select,{p}")).spawn();
    Ok(p)
}
