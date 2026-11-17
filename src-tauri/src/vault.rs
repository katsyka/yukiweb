// Passwords: YukiWeb's own vault (WebView2 has no API to list or edit what it saves).
// vault.bin = the list as JSON, encrypted with Windows DPAPI for the signed-in Windows user.
// Passwords never go to the UI's JavaScript for filling: pw_fill checks the tab's origin and
// types them into the page from here. Settings → Passwords can reveal one on request.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct Entry {
    id: u64,
    origin: String,
    user: String,
    pass: String,
    at: u64,
}

#[derive(Serialize)]
pub struct Row {
    id: u64,
    origin: String,
    user: String,
    at: u64,
}

static LOCK: Mutex<()> = Mutex::new(());

fn now() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

fn file(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d.join("vault.bin"))
}

#[cfg(windows)]
pub(crate) fn dpapi(data: &[u8], protect: bool) -> Result<Vec<u8>, String> {
    use windows::Win32::{Foundation::{LocalFree, HLOCAL}, Security::Cryptography::*};
    unsafe {
        let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
        let mut out = CRYPT_INTEGER_BLOB::default();
        if protect {
            CryptProtectData(&input, windows::core::w!("YukiWeb"), None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        } else {
            CryptUnprotectData(&input, None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, &mut out)
        }
        .map_err(|e| e.to_string())?;
        let v = std::slice::from_raw_parts(out.pbData, out.cbData as usize).to_vec();
        let _ = LocalFree(Some(HLOCAL(out.pbData as _)));
        Ok(v)
    }
}
#[cfg(not(windows))]
pub(crate) fn dpapi(data: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

fn load(app: &AppHandle) -> Result<Vec<Entry>, String> {
    let f = file(app)?;
    if !f.exists() {
        return Ok(vec![]);
    }
    let raw = std::fs::read(&f).map_err(|e| e.to_string())?;
    serde_json::from_slice(&dpapi(&raw, false)?).map_err(|e| e.to_string())
}

fn store(app: &AppHandle, list: &[Entry]) -> Result<(), String> {
    let enc = dpapi(&serde_json::to_vec(list).map_err(|e| e.to_string())?, true)?;
    let f = file(app)?;
    let tmp = f.with_extension("tmp");
    std::fs::write(&tmp, enc).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &f).map_err(|e| e.to_string())
}

fn origin_of(u: &str) -> Option<String> {
    let u = u.parse::<tauri::Url>().ok()?;
    if !matches!(u.scheme(), "http" | "https") {
        return None;
    }
    Some(u.origin().ascii_serialization())
}

// The address the tab shows right now (never what a page message claims).
fn tab_origin(app: &AppHandle, tab: u32) -> Result<String, String> {
    let wv = app.get_webview(&crate::label(tab)).ok_or("no tab")?;
    origin_of(wv.url().map_err(|e| e.to_string())?.as_str()).ok_or("not a website".into())
}

#[tauri::command]
pub async fn pw_list(app: AppHandle) -> Result<Vec<Row>, String> {
    let _g = LOCK.lock().unwrap();
    Ok(load(&app)?.into_iter().map(|e| Row { id: e.id, origin: e.origin, user: e.user, at: e.at }).collect())
}

#[tauri::command]
pub async fn pw_reveal(app: AppHandle, id: u64) -> Result<String, String> {
    let _g = LOCK.lock().unwrap();
    load(&app)?.into_iter().find(|e| e.id == id).map(|e| e.pass).ok_or("gone".into())
}

// Accounts saved for the tab's site, and whether `user`/`pass` (a login just sent) is new,
// changed or already saved: "new" | "update" | "same".
#[tauri::command]
pub async fn pw_for(app: AppHandle, tab: u32, user: Option<String>, pass: Option<String>) -> Result<(Vec<Row>, String), String> {
    let o = tab_origin(&app, tab)?;
    let _g = LOCK.lock().unwrap();
    let list: Vec<Entry> = load(&app)?.into_iter().filter(|e| e.origin == o).collect();
    let state = match (&user, &pass) {
        (Some(u), Some(p)) => match list.iter().find(|e| &e.user == u) {
            Some(e) if &e.pass == p => "same",
            Some(_) => "update",
            None => "new",
        },
        _ => "",
    };
    Ok((list.into_iter().map(|e| Row { id: e.id, origin: e.origin, user: e.user, at: e.at }).collect(), state.into()))
}

#[tauri::command]
// `url`: the page the login was sent from (the UI's record). Sites often redirect elsewhere
// right after a login, so the tab's address by the time "Save" is pressed can be another site.
pub async fn pw_save(app: AppHandle, tab: u32, user: String, pass: String, url: Option<String>) -> Result<(), String> {
    if pass.is_empty() || pass.len() > 1000 || user.len() > 500 {
        return Err("bad login".into());
    }
    let o = match url.as_deref().and_then(origin_of) {
        Some(o) => o,
        None => tab_origin(&app, tab)?,
    };
    let _g = LOCK.lock().unwrap();
    let mut list = load(&app)?;
    match list.iter_mut().find(|e| e.origin == o && e.user == user) {
        Some(e) => {
            e.pass = pass;
            e.at = now();
        }
        None => {
            let id = list.iter().map(|e| e.id).max().unwrap_or(0) + 1;
            list.push(Entry { id, origin: o, user, pass, at: now() });
        }
    }
    store(&app, &list)
}

#[tauri::command]
pub async fn pw_delete(app: AppHandle, id: u64) -> Result<(), String> {
    let _g = LOCK.lock().unwrap();
    let mut list = load(&app)?;
    list.retain(|e| e.id != id);
    store(&app, &list)
}

// Types a saved login into the tab, only if the tab is on the site it was saved for.
#[tauri::command]
pub async fn pw_fill(app: AppHandle, tab: u32, id: u64) -> Result<(), String> {
    let o = tab_origin(&app, tab)?;
    let e = {
        let _g = LOCK.lock().unwrap();
        load(&app)?.into_iter().find(|e| e.id == id).ok_or("gone")?
    };
    if e.origin != o {
        return Err("This login belongs to another site".into());
    }
    let js = format!("window.__yukiweb && __yukiweb.pwFill({}, {})", serde_json::to_string(&e.user).unwrap(), serde_json::to_string(&e.pass).unwrap());
    app.get_webview(&crate::label(tab)).ok_or("no tab")?.eval(js).map_err(|e| e.to_string())
}

// Import from a Chromium-style profile: Edge, Chrome, or the passwords YukiWeb's WebView2
// saved by itself before the vault existed. Chrome's newer app-bound encryption (v20) can't be
// read by other apps; those are counted as skipped.
#[tauri::command]
pub async fn pw_import(app: AppHandle, from: String) -> Result<(u32, u32), String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|e| e.to_string())?;
    let root = match from.as_str() {
        "edge" => std::path::Path::new(&local).join(r"Microsoft\Edge\User Data"),
        "chrome" => std::path::Path::new(&local).join(r"Google\Chrome\User Data"),
        _ => app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("EBWebView"),
    };
    let found = import_from(&root)?;
    let _g = LOCK.lock().unwrap();
    let mut list = load(&app)?;
    let (mut added, mut skipped) = (0, 0);
    for (url, user, pass) in found {
        let (Some(o), Some(p)) = (origin_of(&url), pass) else {
            skipped += 1;
            continue;
        };
        if list.iter().any(|e| e.origin == o && e.user == user) {
            continue;
        }
        let id = list.iter().map(|e| e.id).max().unwrap_or(0) + 1;
        list.push(Entry { id, origin: o, user, pass: p, at: now() });
        added += 1;
    }
    store(&app, &list)?;
    Ok((added, skipped))
}

#[cfg(windows)]
fn import_from(root: &std::path::Path) -> Result<Vec<(String, String, Option<String>)>, String> {
    use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
    use base64::Engine;
    let state: serde_json::Value = serde_json::from_slice(&std::fs::read(root.join("Local State")).map_err(|_| "Nothing to import from there".to_string())?)
        .map_err(|e| e.to_string())?;
    let enc = base64::engine::general_purpose::STANDARD
        .decode(state["os_crypt"]["encrypted_key"].as_str().ok_or("no key")?)
        .map_err(|e| e.to_string())?;
    let key = dpapi(enc.strip_prefix(b"DPAPI").ok_or("unknown key")?, false)?;
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut out = vec![];
    for dir in std::fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        let db = dir.path().join("Login Data");
        if !db.exists() {
            continue;
        }
        // The browser keeps its copy locked; read a snapshot.
        let tmp = std::env::temp_dir().join(format!("yw-login-{}.db", now()));
        if std::fs::copy(&db, &tmp).is_err() {
            continue;
        }
        if let Ok(c) = rusqlite::Connection::open_with_flags(&tmp, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY) {
            if let Ok(mut st) = c.prepare("SELECT origin_url, username_value, password_value FROM logins WHERE blacklisted_by_user = 0") {
                let rows = st.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, Vec<u8>>(2)?)));
                if let Ok(rows) = rows {
                    for (url, user, blob) in rows.flatten() {
                        let pass = if (blob.starts_with(b"v10") || blob.starts_with(b"v11")) && blob.len() > 15 {
                            cipher.decrypt(Nonce::from_slice(&blob[3..15]), &blob[15..]).ok().and_then(|p| String::from_utf8(p).ok())
                        } else {
                            None
                        };
                        out.push((url, user, pass));
                    }
                }
            }
        }
        let _ = std::fs::remove_file(&tmp);
    }
    Ok(out)
}
#[cfg(not(windows))]
fn import_from(_: &std::path::Path) -> Result<Vec<(String, String, Option<String>)>, String> {
    Ok(vec![])
}
