// Desktop agents: screenshots of the main screen, real mouse + keyboard (SendInput), the
// accessibility tree of the front window (UI Automation, which can also press buttons and fill
// fields without moving the mouse), and a click-through overlay that draws the agent's cursor.
// Only one desktop agent uses the real mouse at a time (the panel enforces that); if the user
// moves the mouse while an agent is working, the next action fails with "user" and the agent pauses.
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn desk_shot(width: u32, quality: u8) -> Result<(String, i32, i32), String> {
    imp::shot(width, quality)
}

/// kind: move | click | double | right | scroll | type | keys | drag. x/y are screen pixels.
#[tauri::command]
pub async fn desk_input(kind: String, x: i32, y: i32, x2: Option<i32>, y2: Option<i32>, text: Option<String>, amount: Option<i32>) -> Result<(), String> {
    imp::input(&kind, x, y, x2.unwrap_or(x), y2.unwrap_or(y), text.unwrap_or_default(), amount.unwrap_or(0))
}

/// Forget where the agent left the mouse (after the user hands control back).
#[tauri::command]
pub async fn desk_reset() {
    imp::reset()
}

#[tauri::command]
pub async fn desk_tree() -> Result<serde_json::Value, String> {
    imp::uia(imp::Req::Tree)
}

/// kind: click | type | focus on an element from the last desk_tree.
#[tauri::command]
pub async fn desk_act(index: usize, kind: String, text: Option<String>) -> Result<serde_json::Value, String> {
    imp::uia(imp::Req::Act(index, kind, text.unwrap_or_default()))
}

#[tauri::command]
pub async fn desk_windows() -> Result<serde_json::Value, String> {
    imp::windows()
}

#[tauri::command]
pub async fn desk_focus(title: String) -> Result<bool, String> {
    imp::focus(&title)
}

#[tauri::command]
pub async fn desk_open(target: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("cmd").args(["/C", "start", "", &target]).creation_flags(0x0800_0000).spawn().map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("Windows only".into())
    }
}

/// Draws (or hides) an agent's cursor on top of every window. Screen pixels.
#[tauri::command]
pub async fn desk_cursor(app: AppHandle, show: bool, x: i32, y: i32, name: String, color: String, label: String, click: bool) -> Result<(), String> {
    use tauri::Manager;
    if app.get_webview_window("cursor").is_none() {
        if !show {
            return Ok(());
        }
        let (sw, sh) = imp::screen();
        let mut b = tauri::WebviewWindowBuilder::new(&app, "cursor", tauri::WebviewUrl::App("cursor.html".into()))
            .title("YukiWeb agent cursor")
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .shadow(false)
            .resizable(false)
            .visible(false)
            .disable_drag_drop_handler();
        if let Some(a) = crate::BROWSER_ARGS.get() {
            b = b.additional_browser_args(a);
        }
        let w = b.build().map_err(|e| e.to_string())?;
        // One pixel short of the screen: Windows treats a topmost window covering the whole
        // monitor as a fullscreen app and hides the taskbar.
        let _ = w.set_position(tauri::PhysicalPosition::new(0, 0));
        let _ = w.set_size(tauri::PhysicalSize::new(sw as u32, (sh - 1).max(100) as u32));
        let _ = w.set_ignore_cursor_events(true);
        #[cfg(windows)]
        if let Ok(h) = w.hwnd() {
            use windows::Win32::UI::WindowsAndMessaging::*;
            let h = windows::Win32::Foundation::HWND(h.0);
            unsafe {
                // Never takes focus (the agent's typing must reach the app below), no taskbar/alt-tab entry,
                // and left out of screenshots so agents don't see their own cursors.
                let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
                SetWindowLongW(h, GWL_EXSTYLE, (ex | WS_EX_NOACTIVATE.0 | WS_EX_TOOLWINDOW.0 | WS_EX_TRANSPARENT.0) as i32);
                let _ = SetWindowDisplayAffinity(h, WDA_EXCLUDEFROMCAPTURE);
                let _ = ShowWindow(h, SW_SHOWNOACTIVATE);
            }
        }
        #[cfg(not(windows))]
        let _ = w.show();
        std::thread::sleep(std::time::Duration::from_millis(400));
    }
    let _ = app.emit_to("cursor", "desk-cur", (show, x, y, name, color, label, click));
    Ok(())
}

#[cfg(not(windows))]
mod imp {
    pub enum Req { Tree, Act(usize, String, String) }
    pub fn shot(_: u32, _: u8) -> Result<(String, i32, i32), String> { Err("Windows only".into()) }
    pub fn input(_: &str, _: i32, _: i32, _: i32, _: i32, _: String, _: i32) -> Result<(), String> { Err("Windows only".into()) }
    pub fn reset() {}
    pub fn uia(_: Req) -> Result<serde_json::Value, String> { Err("Windows only".into()) }
    pub fn windows() -> Result<serde_json::Value, String> { Err("Windows only".into()) }
    pub fn focus(_: &str) -> Result<bool, String> { Err("Windows only".into()) }
    pub fn screen() -> (i32, i32) { (1920, 1080) }
}

#[cfg(windows)]
mod imp {
    use base64::Engine;
    use serde_json::{json, Value};
    use std::sync::{mpsc, Mutex, OnceLock};
    use windows::core::BSTR;
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::System::Com::*;
    use windows::Win32::UI::Accessibility::*;
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    use windows::Win32::UI::WindowsAndMessaging::*;

    pub fn screen() -> (i32, i32) {
        unsafe { (GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN)) }
    }

    pub fn shot(width: u32, quality: u8) -> Result<(String, i32, i32), String> {
        let (w, h) = screen();
        if w <= 0 || h <= 0 {
            return Err("No screen".into());
        }
        let mut buf = vec![0u8; (w * h * 4) as usize];
        unsafe {
            let hdc = GetDC(None);
            let mem = CreateCompatibleDC(Some(hdc));
            let bmp = CreateCompatibleBitmap(hdc, w, h);
            let old = SelectObject(mem, bmp.into());
            let _ = BitBlt(mem, 0, 0, w, h, Some(hdc), 0, 0, SRCCOPY | CAPTUREBLT);
            let mut bi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: w,
                    biHeight: -h,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: BI_RGB.0,
                    ..Default::default()
                },
                ..Default::default()
            };
            GetDIBits(mem, bmp, 0, h as u32, Some(buf.as_mut_ptr() as _), &mut bi, DIB_RGB_COLORS);
            SelectObject(mem, old);
            let _ = DeleteObject(bmp.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, hdc);
        }
        // Downscale (2×2 samples per pixel) and BGRA → RGB.
        let tw = (width as i32).clamp(64, w);
        let th = ((h as f64) * (tw as f64) / (w as f64)).round().max(1.0) as i32;
        let k = w as f64 / tw as f64;
        let mut rgb = Vec::with_capacity((tw * th * 3) as usize);
        for y in 0..th {
            for x in 0..tw {
                let mut acc = [0u32; 3];
                for (dx, dy) in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)] {
                    let sx = (((x as f64 + dx) * k) as i32).min(w - 1);
                    let sy = (((y as f64 + dy) * k) as i32).min(h - 1);
                    let i = ((sy * w + sx) * 4) as usize;
                    acc[0] += buf[i + 2] as u32;
                    acc[1] += buf[i + 1] as u32;
                    acc[2] += buf[i] as u32;
                }
                rgb.extend_from_slice(&[(acc[0] / 4) as u8, (acc[1] / 4) as u8, (acc[2] / 4) as u8]);
            }
        }
        let mut out = Vec::new();
        jpeg_encoder::Encoder::new(&mut out, quality.clamp(20, 95))
            .encode(&rgb, tw as u16, th as u16, jpeg_encoder::ColorType::Rgb)
            .map_err(|e| e.to_string())?;
        Ok((base64::engine::general_purpose::STANDARD.encode(out), w, h))
    }

    // Where the agent last left the mouse; if the user moved it since, they're taking over.
    static LAST: Mutex<Option<(i32, i32)>> = Mutex::new(None);
    pub fn reset() {
        *LAST.lock().unwrap() = None;
    }
    fn cursor() -> (i32, i32) {
        let mut p = POINT::default();
        unsafe { let _ = GetCursorPos(&mut p); }
        (p.x, p.y)
    }
    fn check_user() -> Result<(), String> {
        if let Some((lx, ly)) = *LAST.lock().unwrap() {
            let (x, y) = cursor();
            if (x - lx).abs() + (y - ly).abs() > 40 {
                return Err("user".into());
            }
        }
        Ok(())
    }
    fn send(inputs: &[INPUT]) {
        unsafe { SendInput(inputs, std::mem::size_of::<INPUT>() as i32); }
    }
    fn mouse(flags: MOUSE_EVENT_FLAGS, data: i32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    }
    fn key(vk: u16, scan: u16, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: VIRTUAL_KEY(vk), wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
        }
    }
    // Glides the real cursor so the user can follow it.
    fn glide(x: i32, y: i32) {
        let (sx, sy) = cursor();
        let steps = 14;
        for i in 1..=steps {
            let t = i as f64 / steps as f64;
            let e = 1.0 - (1.0 - t).powi(3);
            unsafe { let _ = SetCursorPos(sx + ((x - sx) as f64 * e) as i32, sy + ((y - sy) as f64 * e) as i32); }
            std::thread::sleep(std::time::Duration::from_millis(16));
        }
    }
    fn vk_of(name: &str) -> Option<u16> {
        let n = name.trim().to_lowercase();
        Some(match n.as_str() {
            "ctrl" | "control" => 0x11, "shift" => 0x10, "alt" => 0x12, "win" | "meta" | "cmd" => 0x5B,
            "enter" | "return" => 0x0D, "tab" => 0x09, "esc" | "escape" => 0x1B, "backspace" => 0x08,
            "delete" | "del" => 0x2E, "space" => 0x20, "up" => 0x26, "down" => 0x28, "left" => 0x25, "right" => 0x27,
            "home" => 0x24, "end" => 0x23, "pageup" => 0x21, "pagedown" => 0x22, "insert" => 0x2D,
            _ if n.len() > 1 && n.starts_with('f') && n[1..].parse::<u16>().map_or(false, |k| (1..=12).contains(&k)) => 0x6F + n[1..].parse::<u16>().unwrap(),
            _ if n.len() == 1 && n.chars().next().unwrap().is_ascii_alphanumeric() => n.to_ascii_uppercase().as_bytes()[0] as u16,
            _ => return None,
        })
    }

    pub fn input(kind: &str, x: i32, y: i32, x2: i32, y2: i32, text: String, amount: i32) -> Result<(), String> {
        check_user()?;
        match kind {
            "move" => glide(x, y),
            "click" | "double" | "right" => {
                glide(x, y);
                std::thread::sleep(std::time::Duration::from_millis(60));
                let (d, u) = if kind == "right" { (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP) } else { (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP) };
                let n = if kind == "double" { 2 } else { 1 };
                for _ in 0..n {
                    send(&[mouse(d, 0), mouse(u, 0)]);
                    std::thread::sleep(std::time::Duration::from_millis(40));
                }
            }
            "drag" => {
                glide(x, y);
                send(&[mouse(MOUSEEVENTF_LEFTDOWN, 0)]);
                glide(x2, y2);
                send(&[mouse(MOUSEEVENTF_LEFTUP, 0)]);
            }
            "scroll" => {
                glide(x, y);
                send(&[mouse(MOUSEEVENTF_WHEEL, -amount * 120)]);
            }
            "type" => {
                for u in text.encode_utf16() {
                    if u == '\n' as u16 {
                        send(&[key(0x0D, 0, KEYBD_EVENT_FLAGS(0)), key(0x0D, 0, KEYEVENTF_KEYUP)]);
                    } else {
                        send(&[key(0, u, KEYEVENTF_UNICODE), key(0, u, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP)]);
                    }
                    std::thread::sleep(std::time::Duration::from_millis(8));
                }
            }
            "keys" => {
                let vks: Vec<u16> = text.split('+').map(|k| vk_of(k).ok_or(format!("Unknown key: {k}"))).collect::<Result<_, _>>()?;
                let mut down: Vec<INPUT> = vks.iter().map(|&v| key(v, 0, KEYBD_EVENT_FLAGS(0))).collect();
                down.extend(vks.iter().rev().map(|&v| key(v, 0, KEYEVENTF_KEYUP)));
                send(&down);
            }
            _ => return Err(format!("Unknown action {kind}")),
        }
        *LAST.lock().unwrap() = Some(cursor());
        Ok(())
    }

    // --- Windows ---
    fn title_of(h: HWND) -> String {
        let mut b = [0u16; 256];
        let n = unsafe { GetWindowTextW(h, &mut b) };
        String::from_utf16_lossy(&b[..n.max(0) as usize])
    }
    fn top_windows() -> Vec<(HWND, String, RECT)> {
        unsafe extern "system" fn cb(h: HWND, l: LPARAM) -> windows::core::BOOL {
            let v = &mut *(l.0 as *mut Vec<HWND>);
            v.push(h);
            true.into()
        }
        let mut hs: Vec<HWND> = Vec::new();
        unsafe { let _ = EnumWindows(Some(cb), LPARAM(&mut hs as *mut _ as isize)); }
        let mut out = Vec::new();
        for h in hs {
            unsafe {
                if !IsWindowVisible(h).as_bool() { continue; }
                let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
                if ex & WS_EX_TOOLWINDOW.0 != 0 { continue; }
                let t = title_of(h);
                if t.is_empty() || t == "YukiWeb agent cursor" || t == "Program Manager" { continue; }
                let mut r = RECT::default();
                let _ = GetWindowRect(h, &mut r);
                if r.right - r.left < 50 || r.bottom - r.top < 50 { continue; }
                out.push((h, t, r));
            }
        }
        out
    }
    pub fn windows() -> Result<Value, String> {
        let fg = unsafe { GetForegroundWindow() };
        Ok(Value::Array(top_windows().into_iter().take(20).map(|(h, t, r)| json!({ "title": t, "front": h == fg, "min": unsafe { IsIconic(h).as_bool() }, "r": [r.left, r.top, r.right, r.bottom] })).collect()))
    }
    pub fn focus(title: &str) -> Result<bool, String> {
        let lt = title.to_lowercase();
        let Some((h, _, _)) = top_windows().into_iter().find(|(_, t, _)| t.to_lowercase().contains(&lt)) else { return Ok(false) };
        unsafe {
            if IsIconic(h).as_bool() { let _ = ShowWindow(h, SW_RESTORE); }
            // Windows only lets the app that got the last input bring a window forward: tap Alt first.
            send(&[key(0x12, 0, KEYBD_EVENT_FLAGS(0)), key(0x12, 0, KEYEVENTF_KEYUP)]);
            let _ = SetForegroundWindow(h);
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
        Ok(true)
    }

    // --- UI Automation lives on its own thread (COM objects can't move between threads). ---
    pub enum Req { Tree, Act(usize, String, String) }
    type Job = (Req, mpsc::Sender<Result<Value, String>>);
    static TX: OnceLock<Mutex<mpsc::Sender<Job>>> = OnceLock::new();

    pub fn uia(req: Req) -> Result<Value, String> {
        let tx = TX.get_or_init(|| {
            let (tx, rx) = mpsc::channel::<Job>();
            std::thread::spawn(move || worker(rx));
            Mutex::new(tx)
        });
        let (rtx, rrx) = mpsc::channel();
        tx.lock().unwrap().send((req, rtx)).map_err(|e| e.to_string())?;
        rrx.recv_timeout(std::time::Duration::from_secs(20)).map_err(|_| "The app didn't answer".to_string())?
    }

    const TYPES: [&str; 39] = ["button", "calendar", "checkbox", "combobox", "edit", "link", "image", "listitem", "list", "menu", "menubar", "menuitem", "progress", "radio", "scrollbar", "slider", "spinner", "statusbar", "tab", "tabitem", "text", "toolbar", "tooltip", "tree", "treeitem", "custom", "group", "thumb", "grid", "cell", "document", "splitbutton", "window", "pane", "header", "headeritem", "table", "titlebar", "separator"];
    const ACTIVE: [&str; 13] = ["button", "checkbox", "combobox", "edit", "link", "listitem", "menuitem", "radio", "tabitem", "treeitem", "splitbutton", "slider", "cell"];

    fn worker(rx: mpsc::Receiver<Job>) {
        unsafe { let _ = CoInitializeEx(None, COINIT_MULTITHREADED); }
        let auto: Option<IUIAutomation> = unsafe { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok() };
        let mut cache: Vec<IUIAutomationElement> = Vec::new();
        for (req, reply) in rx {
            let Some(a) = auto.as_ref() else {
                let _ = reply.send(Err("UI Automation isn't available".into()));
                continue;
            };
            let r = match req {
                Req::Tree => tree(a, &mut cache),
                Req::Act(i, kind, text) => match cache.get(i) {
                    Some(el) => act(el, &kind, &text),
                    None => Err("That element is gone; look again".into()),
                },
            };
            let _ = reply.send(r);
        }
    }

    fn tree(a: &IUIAutomation, cache: &mut Vec<IUIAutomationElement>) -> Result<Value, String> {
        cache.clear();
        let fg = unsafe { GetForegroundWindow() };
        let title = title_of(fg);
        let root = unsafe { a.ElementFromHandle(fg) }.map_err(|e| e.to_string())?;
        let walker = unsafe { a.ControlViewWalker() }.map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        let mut queue = std::collections::VecDeque::from([(root, 0u32)]);
        let (mut seen, mut cells) = (0, 0);
        while let Some((el, depth)) = queue.pop_front() {
            seen += 1;
            if seen > 600 || out.len() >= 300 { break; }
            unsafe {
                let ct = el.CurrentControlType().map(|c| c.0).unwrap_or(0);
                let ty = TYPES.get((ct - 50000).max(0) as usize).copied().unwrap_or("other");
                let name = el.CurrentName().map(|b| b.to_string()).unwrap_or_default();
                let off = el.CurrentIsOffscreen().map(|b| b.as_bool()).unwrap_or(true);
                let r = el.CurrentBoundingRectangle().unwrap_or_default();
                let interactive = ACTIVE.contains(&ty);
                if ty == "cell" { cells += 1; }
                if !off && r.right > r.left && r.bottom > r.top && (interactive || !name.trim().is_empty()) && !(ty == "cell" && cells > 80) {
                    let mut o = json!({ "i": cache.len(), "t": ty, "n": name.chars().take(80).collect::<String>(), "r": [r.left, r.top, r.right, r.bottom] });
                    if ty == "edit" || ty == "combobox" || ty == "cell" {
                        if let Ok(v) = el.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
                            if let Ok(s) = v.CurrentValue() { o["v"] = json!(s.to_string().chars().take(120).collect::<String>()); }
                        }
                    }
                    if !el.CurrentIsEnabled().map(|b| b.as_bool()).unwrap_or(true) { o["off"] = json!(true); }
                    out.push(o);
                    cache.push(el.clone());
                }
                if depth < 30 {
                    let mut c = walker.GetFirstChildElement(&el).ok();
                    while let Some(ch) = c {
                        let next = walker.GetNextSiblingElement(&ch).ok();
                        queue.push_back((ch, depth + 1));
                        c = next;
                    }
                }
            }
        }
        Ok(json!({ "window": title, "items": out }))
    }

    fn act(el: &IUIAutomationElement, kind: &str, text: &str) -> Result<Value, String> {
        let rect = unsafe { el.CurrentBoundingRectangle().unwrap_or_default() };
        let r = json!([rect.left, rect.top, rect.right, rect.bottom]);
        unsafe {
            match kind {
                "click" => {
                    if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationInvokePattern>(UIA_InvokePatternId) {
                        if p.Invoke().is_ok() { return Ok(json!({ "ok": true, "how": "invoke", "r": r })); }
                    }
                    if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationTogglePattern>(UIA_TogglePatternId) {
                        if p.Toggle().is_ok() { return Ok(json!({ "ok": true, "how": "toggle", "r": r })); }
                    }
                    if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationSelectionItemPattern>(UIA_SelectionItemPatternId) {
                        if p.Select().is_ok() { return Ok(json!({ "ok": true, "how": "select", "r": r })); }
                    }
                    if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationExpandCollapsePattern>(UIA_ExpandCollapsePatternId) {
                        if p.Expand().is_ok() { return Ok(json!({ "ok": true, "how": "expand", "r": r })); }
                    }
                    Ok(json!({ "ok": false, "r": r }))
                }
                "type" => {
                    if let Ok(p) = el.GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId) {
                        if p.SetValue(&BSTR::from(text)).is_ok() { return Ok(json!({ "ok": true, "how": "value", "r": r })); }
                    }
                    Ok(json!({ "ok": false, "r": r }))
                }
                "focus" => Ok(json!({ "ok": el.SetFocus().is_ok(), "r": r })),
                _ => Err(format!("Unknown action {kind}")),
            }
        }
    }
}
