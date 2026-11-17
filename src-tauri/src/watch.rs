// Freeze watchdog. A thread pings the main thread every second. If it stops answering:
// - while the window is fullscreen, the window is minimized with ShowWindowAsync (works on a
//   hung window) so the taskbar and the rest of Windows come back;
// - the last things the app did (crumbs) are written to app data/hang.log and sent to the
//   debug log on the next start.
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering::Relaxed},
        Mutex, OnceLock,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Manager};

static T0: OnceLock<Instant> = OnceLock::new();
static PULSE: AtomicU64 = AtomicU64::new(0);
static HWND: AtomicIsize = AtomicIsize::new(0);
static MINIMIZED: AtomicBool = AtomicBool::new(false);
static CRUMBS: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

fn now() -> u64 {
    T0.get_or_init(Instant::now).elapsed().as_millis() as u64
}

/// Notes what the app is doing, for the hang report.
pub fn crumb(s: impl Into<String>) {
    let t = now();
    let mut c = CRUMBS.lock().unwrap();
    if c.len() >= 40 {
        c.pop_front();
    }
    c.push_back(format!("{:.1}s {}", t as f64 / 1000.0, s.into()));
}

fn file(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("hang.log"))
}

pub fn start(app: &AppHandle) {
    now();
    #[cfg(windows)]
    if let Some(h) = app.get_window("main").and_then(|w| w.hwnd().ok()) {
        HWND.store(h.0 as isize, Relaxed);
    }
    // Last run's report, once the UI is up to forward it.
    if let Some(f) = file(app) {
        if let Ok(txt) = std::fs::read_to_string(&f) {
            let _ = std::fs::remove_file(&f);
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(8));
                for l in txt.lines().take(60) {
                    crate::rlog(format!("prev hang: {l}"));
                }
            });
        }
    }
    let a = app.clone();
    std::thread::spawn(move || {
        let mut since: Option<u64> = None;
        let mut reported = false;
        loop {
            std::thread::sleep(Duration::from_millis(1000));
            let _ = a.run_on_main_thread(|| PULSE.store(now(), Relaxed));
            let late = now().saturating_sub(PULSE.load(Relaxed));
            if late < 2500 {
                if let Some(s) = since.take() {
                    let secs = (now() - s) as f64 / 1000.0;
                    crate::rlog(format!("main thread was stuck {secs:.1}s"));
                    if MINIMIZED.swap(false, Relaxed) {
                        // We minimized a fullscreen window: leave fullscreen for real now.
                        let a2 = a.clone();
                        let _ = a.run_on_main_thread(move || crate::set_full(&a2, false));
                    }
                }
                reported = false;
                continue;
            }
            since.get_or_insert(now() - late);
            if late > 4000 && !reported {
                reported = true;
                let full = crate::FULL.load(Relaxed);
                let mut txt = format!("main thread not answering for {}ms, fullscreen {full}\n", late);
                for c in CRUMBS.lock().unwrap().iter() {
                    txt += c;
                    txt.push('\n');
                }
                if let Some(f) = file(&a) {
                    let _ = std::fs::write(f, &txt);
                }
                #[cfg(windows)]
                if full || covers_screen() {
                    use windows::Win32::{Foundation::HWND as H, UI::WindowsAndMessaging::*};
                    let h = H(HWND.load(Relaxed) as *mut _);
                    unsafe {
                        let _ = ShowWindowAsync(h, SW_MINIMIZE);
                    }
                    MINIMIZED.store(true, Relaxed);
                    if let Some(f) = file(&a) {
                        let _ = std::fs::write(f, txt + "-> minimized the window\n");
                    }
                }
            }
        }
    });
}

// Does the window cover its whole monitor (fullscreen, taskbar hidden)?
#[cfg(windows)]
fn covers_screen() -> bool {
    use windows::Win32::{
        Foundation::{HWND as H, RECT},
        Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
        UI::WindowsAndMessaging::GetWindowRect,
    };
    let h = H(HWND.load(Relaxed) as *mut _);
    unsafe {
        let mut r = RECT::default();
        if GetWindowRect(h, &mut r).is_err() {
            return false;
        }
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        if !GetMonitorInfoW(MonitorFromWindow(h, MONITOR_DEFAULTTONEAREST), &mut mi).as_bool() {
            return false;
        }
        let m = mi.rcMonitor;
        r.left <= m.left && r.top <= m.top && r.right >= m.right && r.bottom >= m.bottom
    }
}
