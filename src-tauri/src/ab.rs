// Ad blocker: third-party requests to known ad/tracker hosts get an empty 403.
// rules/adblock.txt = domain rules from EasyList + EasyPrivacy + Peter Lowe's list.
// Settings (on, allowed sites, blocked total) live in app data/adblock.json.
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering::Relaxed},
        Mutex, OnceLock,
    },
};
use tauri::{AppHandle, Manager};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Saved {
    #[serde(default = "yes")]
    pub on: bool,
    #[serde(default)]
    pub allow: Vec<String>,
    #[serde(default)]
    pub total: u64,
}
fn yes() -> bool { true }

#[derive(Default)]
pub struct Ab {
    on: AtomicBool,
    allow: Mutex<HashSet<String>>,
    total: AtomicU64,
    tabs: Mutex<HashMap<u32, u32>>,
}

fn rules() -> &'static HashSet<&'static str> {
    static R: OnceLock<HashSet<&'static str>> = OnceLock::new();
    R.get_or_init(|| include_str!("../rules/adblock.txt").lines().filter(|l| !l.is_empty()).collect())
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    let _ = fs::create_dir_all(&d);
    Some(d.join("adblock.json"))
}

pub fn load(app: &AppHandle) {
    let s: Saved = file(app)
        .and_then(|f| fs::read(f).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or(Saved { on: true, ..Default::default() });
    let ab = app.state::<Ab>();
    ab.on.store(s.on, Relaxed);
    ab.total.store(s.total, Relaxed);
    *ab.allow.lock().unwrap() = s.allow.into_iter().collect();
    // Build the set off the main thread so the first page doesn't wait for it.
    std::thread::spawn(|| { rules(); });
}

fn snapshot(ab: &Ab) -> Saved {
    let mut allow: Vec<String> = ab.allow.lock().unwrap().iter().cloned().collect();
    allow.sort();
    Saved { on: ab.on.load(Relaxed), allow, total: ab.total.load(Relaxed) }
}

pub fn save(app: &AppHandle) {
    if let Some(f) = file(app) {
        let _ = fs::write(f, serde_json::to_vec(&snapshot(&app.state::<Ab>())).unwrap());
    }
}

// "a.b.example.co.uk" → is it, or any parent, a rule?
fn listed(host: &str) -> bool {
    let r = rules();
    let mut h = host;
    loop {
        if r.contains(h) { return true; }
        match h.find('.') {
            Some(i) if h[i + 1..].contains('.') => h = &h[i + 1..],
            _ => return false,
        }
    }
}

// Last two labels — close enough to "same site" for skipping first-party requests.
fn site(h: &str) -> &str {
    let mut it = h.rmatch_indices('.');
    it.next();
    match it.next() { Some((i, _)) => &h[i + 1..], None => h }
}

fn allowed(allow: &HashSet<String>, page: &str) -> bool {
    let p = page.strip_prefix("www.").unwrap_or(page);
    allow.iter().any(|a| p == a || p.ends_with(&format!(".{a}")))
}

/// Should this request (host) made by a page on `page` be blocked? Counts it if so.
pub fn check(app: &AppHandle, tab: u32, page: &str, host: &str) -> bool {
    let ab = app.state::<Ab>();
    if !ab.on.load(Relaxed) || page.is_empty() || host.is_empty() || site(host) == site(page) {
        return false;
    }
    if !listed(host) || allowed(&ab.allow.lock().unwrap(), page) {
        return false;
    }
    ab.total.fetch_add(1, Relaxed);
    *ab.tabs.lock().unwrap().entry(tab).or_default() += 1;
    true
}

/// New page in a tab: its counter starts over.
pub fn reset(app: &AppHandle, tab: u32) {
    app.state::<Ab>().tabs.lock().unwrap().remove(&tab);
}

#[derive(serde::Serialize)]
pub struct Info {
    #[serde(flatten)]
    s: Saved,
    rules: usize,
    here: u32,
}

#[tauri::command]
pub fn ab_get(app: AppHandle) -> Info {
    let active = app.state::<Mutex<crate::State>>().lock().unwrap().active;
    let ab = app.state::<Ab>();
    let here = ab.tabs.lock().unwrap().get(&active).copied().unwrap_or(0);
    save(&app);
    Info { s: snapshot(&ab), rules: rules().len(), here }
}

#[tauri::command]
pub fn ab_set(app: AppHandle, on: bool, allow: Vec<String>) {
    let ab = app.state::<Ab>();
    ab.on.store(on, Relaxed);
    *ab.allow.lock().unwrap() = allow.into_iter().map(|s| s.trim().to_lowercase()).filter(|s| s.contains('.')).collect();
    save(&app);
}
