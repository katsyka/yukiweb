// Browser-only VPN: a bundled sing-box runs as a local SOCKS proxy that every
// webview uses. Toggling the VPN or changing DNS rewrites its config and
// restarts it; tabs never reload because the proxy address stays the same.

use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Server {
    name: String,
    host: String,
    port: u16,
    uuid: String,
    flow: String,
    security: String,
    sni: String,
    pbk: String,
    sid: String,
    fp: String,
    net: String,
    path: String,
    svc: String,
    hosthdr: String,
}

#[derive(Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(default)]
pub struct Vpn {
    on: bool,
    sub: String,
    servers: Vec<Server>,
    sel: usize,
    dns: String,
    dns_custom: String,
    // Sites that skip the VPN, or with mode "only" the sole sites that use it.
    sites: Vec<String>,
    mode: String,
    // Russian sites (.ru/.su/.рф and known Russian services) skip the VPN.
    ru: bool,
}

pub struct Proxy {
    pub port: u16,
    child: Mutex<Option<Child>>,
    vpn: Mutex<Vpn>,
    err: Mutex<String>,
    // Hosts each listed site was seen loading from (its CDNs, login, APIs), so the whole page
    // takes the same route. { site: [hosts] }, saved in learned.json.
    learned: Mutex<std::collections::BTreeMap<String, std::collections::BTreeSet<String>>>,
    writing: std::sync::atomic::AtomicBool,
}

// Blocked or slowed in Russia: never learned as "direct", even when a listed site embeds them.
const NEVER_LEARN: &[&str] = &[
    "youtube.com", "youtu.be", "googlevideo.com", "ytimg.com", "ggpht.com", "instagram.com", "cdninstagram.com",
    "facebook.com", "fbcdn.net", "twitter.com", "x.com", "twimg.com", "discord.com", "discordapp.com", "discord.gg",
    "discordapp.net", "telegram.org", "t.me", "linkedin.com", "openai.com", "chatgpt.com", "claude.ai", "anthropic.com",
    "spotify.com", "scdn.co", "netflix.com", "nflxvideo.net", "tiktok.com", "soundcloud.com", "medium.com",
];
const RU_SITES: &[u8] = include_bytes!("../rules/geosite-category-ru.srs");
const RU_GOV: &[u8] = include_bytes!("../rules/geosite-category-gov-ru.srs");

fn under(host: &str, d: &str) -> bool {
    host == d || host.ends_with(&format!(".{d}"))
}

#[derive(Clone, serde::Serialize)]
struct VpnEv {
    on: bool,
    name: String,
    err: String,
}

pub fn sing_box_exe() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?.parent()?.join(if cfg!(windows) { "sing-box.exe" } else { "sing-box" });
    exe.exists().then_some(exe)
}

pub fn free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(20808)
}

// The proxy port is part of WebView2's launch args, and WebView2 refuses to start
// if leftover processes from the last run used different args. So keep it stable.
pub fn stable_port(app: &AppHandle) -> u16 {
    let file = data_dir(app).map(|d| d.join("port")).ok();
    let saved = file.as_ref().and_then(|f| fs::read_to_string(f).ok()).and_then(|s| s.trim().parse::<u16>().ok());
    if let Some(p) = saved {
        if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return p;
        }
    }
    let p = free_port();
    if let Some(f) = file {
        let _ = fs::write(f, p.to_string());
    }
    p
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn dns_server(v: &Vpn) -> Value {
    let doh = |ip: &str| json!({ "type": "https", "tag": "dns", "server": ip });
    match v.dns.as_str() {
        "cloudflare" => doh("1.1.1.1"),
        "google" => doh("8.8.8.8"),
        "quad9" => doh("9.9.9.9"),
        "adguard" => doh("94.140.14.14"),
        "custom" => {
            let c = v.dns_custom.trim();
            match c.parse::<tauri::Url>() {
                Ok(u) if u.scheme() == "https" && u.host_str().is_some() => {
                    let mut s = json!({ "type": "https", "tag": "dns", "server": u.host_str(), "domain_resolver": "local" });
                    if u.path() != "/" {
                        s["path"] = json!(u.path());
                    }
                    s
                }
                _ if c.parse::<std::net::IpAddr>().is_ok() => json!({ "type": "udp", "tag": "dns", "server": c }),
                _ => json!({ "type": "local", "tag": "dns" }),
            }
        }
        _ => json!({ "type": "local", "tag": "dns" }),
    }
}

fn vless(s: &Server) -> Value {
    let mut o = json!({ "type": "vless", "tag": "vpn", "server": s.host, "server_port": s.port, "uuid": s.uuid });
    if !s.flow.is_empty() {
        o["flow"] = json!(s.flow);
    }
    if s.security == "reality" || s.security == "tls" {
        let sni = if s.sni.is_empty() { &s.host } else { &s.sni };
        let fp = if s.fp.is_empty() { "chrome" } else { &s.fp };
        let mut tls = json!({ "enabled": true, "server_name": sni, "utls": { "enabled": true, "fingerprint": fp } });
        if s.security == "reality" {
            tls["reality"] = json!({ "enabled": true, "public_key": s.pbk, "short_id": s.sid });
        }
        o["tls"] = tls;
    }
    match s.net.as_str() {
        "ws" => {
            let mut t = json!({ "type": "ws", "path": if s.path.is_empty() { "/" } else { &s.path } });
            if !s.hosthdr.is_empty() {
                t["headers"] = json!({ "Host": s.hosthdr });
            }
            o["transport"] = t;
        }
        "grpc" => o["transport"] = json!({ "type": "grpc", "service_name": s.svc }),
        _ => {}
    }
    o
}

// dir: where the rule files live (written by write_rules).
pub fn config(v: &Vpn, port: u16, on: bool, dir: &std::path::Path) -> Value {
    let mut outbounds = vec![json!({ "type": "direct", "tag": "direct" })];
    let server = v.servers.get(v.sel).filter(|_| on);
    if let Some(s) = server {
        outbounds.push(vless(s));
    }
    let only = v.mode == "only";
    let fin = if server.is_some() && !only { "vpn" } else { "direct" };
    // Local addresses always go direct. Listed sites (and what they load) flip to the other
    // outbound; sing-box reloads sites.json by itself when we learn a new host.
    let mut rules = vec![json!({ "ip_is_private": true, "outbound": "direct" })];
    let mut sets = vec![];
    let mut dns_rules = vec![];
    let path = |f: &str| dir.join(f).to_string_lossy().to_string();
    if server.is_some() {
        sets.push(json!({ "type": "local", "tag": "sites", "format": "source", "path": path("sites.json") }));
        rules.push(json!({ "rule_set": ["sites"], "outbound": if only { "vpn" } else { "direct" } }));
        if !only {
            // Ask our own DNS for sites that go direct, so their CDNs answer with nearby servers.
            dns_rules.push(json!({ "rule_set": ["sites"], "server": "local" }));
        }
        if v.ru && !only {
            sets.push(json!({ "type": "local", "tag": "ru", "format": "binary", "path": path("ru.srs") }));
            sets.push(json!({ "type": "local", "tag": "ru-gov", "format": "binary", "path": path("ru-gov.srs") }));
            rules.push(json!({ "domain_suffix": ["ru", "su", "xn--p1ai"], "outbound": "direct" }));
            rules.push(json!({ "rule_set": ["ru", "ru-gov"], "outbound": "direct" }));
            dns_rules.push(json!({ "domain_suffix": ["ru", "su", "xn--p1ai"], "server": "local" }));
            dns_rules.push(json!({ "rule_set": ["ru", "ru-gov"], "server": "local" }));
        }
    }
    json!({
        "log": { "level": "warn", "timestamp": true },
        "dns": { "servers": [dns_server(v), { "type": "local", "tag": "local" }], "rules": dns_rules, "final": "dns" },
        "inbounds": [{ "type": "mixed", "tag": "in", "listen": "127.0.0.1", "listen_port": port }],
        "outbounds": outbounds,
        "route": { "rules": rules, "rule_set": sets, "final": fin, "default_domain_resolver": "dns" }
    })
}

// sites.json = the listed sites plus what they were seen loading; ru*.srs = bundled lists.
fn write_rules(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?;
    let p = app.state::<Proxy>();
    let v = p.vpn.lock().unwrap().clone();
    let learned = p.learned.lock().unwrap();
    let mut hosts: Vec<&String> = v.sites.iter().filter_map(|s| learned.get(s)).flatten().collect();
    hosts.sort();
    hosts.dedup();
    // A rule needs at least one entry; .invalid never resolves.
    let mut suffix = v.sites.clone();
    suffix.push("yukiweb.invalid".into());
    let set = json!({ "version": 2, "rules": [{ "domain_suffix": suffix }, { "domain": if hosts.is_empty() { vec![&suffix[suffix.len() - 1]] } else { hosts } }] });
    // Write-then-rename so sing-box never reads half a file.
    let tmp = dir.join("sites.json.tmp");
    fs::write(&tmp, serde_json::to_vec(&set).unwrap()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join("sites.json")).map_err(|e| e.to_string())?;
    let _ = fs::write(dir.join("ru.srs"), RU_SITES);
    let _ = fs::write(dir.join("ru-gov.srs"), RU_GOV);
    Ok(dir)
}

// Which listed site a page belongs to, while the VPN is on (None = nothing to learn).
pub fn site_of(app: &AppHandle, host: &str) -> Option<String> {
    let p = app.try_state::<Proxy>()?;
    let v = p.vpn.lock().unwrap();
    if !v.on || v.servers.is_empty() {
        return None;
    }
    v.sites.iter().find(|s| under(host, s)).cloned()
}

// A page of `site` loaded something from `host`: route it the same way from now on.
pub fn learn(app: &AppHandle, site: &str, host: &str) {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty() || host.parse::<std::net::IpAddr>().is_ok() || NEVER_LEARN.iter().any(|d| under(&host, d)) {
        return;
    }
    let Some(p) = app.try_state::<Proxy>() else { return };
    if p.vpn.lock().unwrap().sites.iter().any(|s| under(&host, s)) {
        return;
    }
    {
        let mut l = p.learned.lock().unwrap();
        let set = l.entry(site.to_string()).or_default();
        if set.len() >= 300 || !set.insert(host) {
            return;
        }
    }
    // A page load brings a burst of new hosts: write once, a moment later.
    if p.writing.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let a = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(300));
        let p = a.state::<Proxy>();
        p.writing.store(false, std::sync::atomic::Ordering::SeqCst);
        let _ = write_rules(&a);
        if let Ok(d) = data_dir(&a) {
            let _ = fs::write(d.join("learned.json"), serde_json::to_vec(&*p.learned.lock().unwrap()).unwrap());
        }
    });
}

// Windows: put sing-box in a kill-on-close job so it dies with YukiWeb, even on a crash.
#[cfg(windows)]
fn bind_to_us(child: &Child) {
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::{Foundation::HANDLE, System::JobObjects::*};
    static JOB: std::sync::OnceLock<usize> = std::sync::OnceLock::new();
    unsafe {
        let job = *JOB.get_or_init(|| {
            let Ok(job) = CreateJobObjectW(None, None) else { return 0 };
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let _ = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const _,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );
            job.0 as usize
        });
        if job != 0 {
            let _ = AssignProcessToJobObject(HANDLE(job as _), HANDLE(child.as_raw_handle() as _));
        }
    }
}

#[cfg(not(windows))]
fn bind_to_us(_: &Child) {}

fn spawn(app: &AppHandle, cfg: &Value) -> Result<Child, String> {
    let exe = sing_box_exe().ok_or("sing-box is missing")?;
    let dir = data_dir(app)?;
    let path = dir.join("sing-box.json");
    fs::write(&path, serde_json::to_vec_pretty(cfg).unwrap()).map_err(|e| e.to_string())?;
    let log = fs::File::create(dir.join("sing-box.log")).map_err(|e| e.to_string())?;
    let mut cmd = Command::new(exe);
    cmd.arg("run").arg("-c").arg(&path).stdout(Stdio::null()).stderr(log);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    bind_to_us(&child);
    std::thread::sleep(Duration::from_millis(400));
    if let Ok(Some(st)) = child.try_wait() {
        let tail = fs::read_to_string(dir.join("sing-box.log")).unwrap_or_default();
        let tail: String = tail.lines().rev().take(3).collect::<Vec<_>>().join(" | ");
        return Err(format!("sing-box exited ({st}): {tail}"));
    }
    Ok(child)
}

// (Re)start sing-box with the current settings. If the VPN config fails, fall
// back to direct so browsing keeps working, and report the error.
pub fn restart(app: &AppHandle) -> Result<(), String> {
    let p = app.state::<Proxy>();
    let v = p.vpn.lock().unwrap().clone();
    if let Some(mut c) = p.child.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
    let dir = write_rules(app)?;
    let res = match spawn(app, &config(&v, p.port, v.on, &dir)) {
        Ok(c) => Ok(c),
        Err(e) if v.on => spawn(app, &config(&v, p.port, false, &dir)).and(Err(e)),
        Err(e) => Err(e),
    };
    let err = match res {
        Ok(c) => {
            *p.child.lock().unwrap() = Some(c);
            String::new()
        }
        Err(e) => {
            crate::rlog(format!("vpn: {e}"));
            e
        }
    };
    *p.err.lock().unwrap() = err.clone();
    let name = v.servers.get(v.sel).map(|s| s.name.clone()).unwrap_or_default();
    let on = v.on && err.is_empty();
    *ACTIVE.lock().unwrap() = if on { name.clone() } else { String::new() };
    let _ = app.emit_to("ui", "vpn", VpnEv { on, name: name.clone(), err: err.clone() });
    // sing-box starting says nothing about the server: it can accept the tunnel and then
    // pass nothing, which leaves every page white. Load a tiny page through it to find out.
    let gen = CHECK.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    if on && v.mode != "only" {
        let (h, port) = (app.clone(), p.port);
        std::thread::spawn(move || {
            if probe(port) || probe(port) || CHECK.load(std::sync::atomic::Ordering::SeqCst) != gen {
                return;
            }
            let e = format!("{name} isn't responding. Pick another server or turn the VPN off.");
            crate::rlog(format!("vpn: check failed for {name}"));
            *h.state::<Proxy>().err.lock().unwrap() = e.clone();
            let _ = h.emit_to("ui", "vpn", VpnEv { on: true, name, err: e });
        });
    }
    if err.is_empty() { Ok(()) } else { Err(err) }
}

// Name of the server pages go through, empty when the VPN is off or broken.
static ACTIVE: Mutex<String> = Mutex::new(String::new());
// Bumped on every restart so a slow check can't report on a server that's no longer selected.
static CHECK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

pub fn active() -> String {
    ACTIVE.lock().unwrap().clone()
}

// Plain-HTTP request through the local proxy; true when a 2xx comes back within 10 s.
fn probe(port: u16) -> bool {
    use std::io::{Read, Write};
    let Ok(mut s) = std::net::TcpStream::connect(("127.0.0.1", port)) else { return false };
    let _ = s.set_read_timeout(Some(Duration::from_secs(10)));
    let req = "GET http://cp.cloudflare.com/generate_204 HTTP/1.1\r\nHost: cp.cloudflare.com\r\nConnection: close\r\n\r\n";
    let mut b = [0u8; 10];
    s.write_all(req.as_bytes()).is_ok() && s.read_exact(&mut b).is_ok() && b.starts_with(b"HTTP/1.") && b[9] == b'2'
}

pub fn init(app: &AppHandle, port: u16) {
    let v = data_dir(app)
        .ok()
        .and_then(|d| fs::read(d.join("vpn.json")).ok())
        .and_then(|b| serde_json::from_slice::<Vpn>(&b).ok())
        .unwrap_or_default();
    let learned = data_dir(app)
        .ok()
        .and_then(|d| fs::read(d.join("learned.json")).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default();
    app.manage(Proxy {
        port,
        child: Mutex::new(None),
        vpn: Mutex::new(v),
        err: Mutex::new(String::new()),
        learned: Mutex::new(learned),
        writing: Default::default(),
    });
    let _ = restart(app);
    // Watchdog: if sing-box dies, every tab loses the network, so bring it back.
    let h = app.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(3));
        let p = h.state::<Proxy>();
        let dead = matches!(p.child.lock().unwrap().as_mut().map(|c| c.try_wait()), Some(Ok(Some(_))));
        if dead {
            crate::rlog("vpn: sing-box died, restarting".into());
            let _ = restart(&h);
        }
    });
}

pub fn stop(app: &AppHandle) {
    if let Some(p) = app.try_state::<Proxy>() {
        if let Some(mut c) = p.child.lock().unwrap().take() {
            let _ = c.kill();
        }
    }
}

#[tauri::command]
pub async fn vpn_get(app: AppHandle) -> (Vpn, String) {
    let p = app.state::<Proxy>();
    let v = p.vpn.lock().unwrap().clone();
    let e = p.err.lock().unwrap().clone();
    (v, e)
}

#[tauri::command]
pub async fn vpn_set(app: AppHandle, v: Vpn) -> Result<(), String> {
    let d = data_dir(&app)?;
    fs::write(d.join("vpn.json"), serde_json::to_vec(&v).unwrap()).map_err(|e| e.to_string())?;
    *app.state::<Proxy>().vpn.lock().unwrap() = v;
    restart(&app)
}
