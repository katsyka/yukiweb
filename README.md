# YukiWeb

A desktop web browser for Windows, built with Tauri v2 and WebView2, with a built-in VPN, account sync and integration with the Yuki apps.

**Download:** [yuki.yukichat.lol/yukiweb](https://yuki.yukichat.lol/yukiweb) · **Android version:** [yukiweb-android](https://github.com/katsyka/yukiweb-android)

## Features

**Browsing**
- Tabs as separate WebView2 instances, with groups, drag-to-reorder, split view, private tabs and session restore
- Background tabs are suspended automatically to save memory, unless they are playing audio
- Command palette (`Ctrl+K`), tab search, link peek (`Shift`+click) and hover previews
- Bookmarks and history, with bookmark import from Chrome and Edge
- Chrome Web Store extensions
- Downloads manager, per-site permissions and saved passwords

**Page tools**
- Find in page, reader mode, translation and a selection toolbar
- Highlights and notes, screenshots, QR codes for the current page, picture-in-picture

**Built in**
- VPN powered by sing-box, with per-site rules
- New-tab dashboard and a yearly usage summary ("Wrapped")
- Yuki ID sign-in with sync of settings, history and bookmarks across PC and Android
- Themes and wallpapers
- English, Russian and German UI
- Auto-updater

## Stack

- **Shell:** Rust, Tauri v2 (multi-webview), `webview2-com`
- **UI:** plain HTML, CSS and JavaScript, no framework
- **Installer:** NSIS

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | Browser UI: toolbar (`index.html`, `ui.js`, `ui.css`), new tab, settings, panels, error pages, i18n, themes |
| `src-tauri/src/` | Rust: tab and webview management (`main.rs`), VPN (`vpn.rs`), downloads, permissions, extensions, page tools |
| `src-tauri/installer-hooks.nsh` | Registers YukiWeb as a default-browser candidate |
| `brand/` | Logo sources |

## Building

YukiWeb targets Windows. It can be built natively on Windows, or cross-compiled from Linux with `cargo-xwin`.

Prerequisites: Rust, Node.js, and NSIS 3.10+ (on Linux, also LLVM 18 and `cargo-xwin`).

The VPN needs the sing-box Windows binary at `src-tauri/binaries/sing-box-x86_64-pc-windows-msvc.exe`. It is not included in this repository; download it from the [sing-box releases](https://github.com/SagerNet/sing-box/releases).

```sh
npm install
npx tauri build                                               # on Windows
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc   # cross-compile from Linux
```

Releases are signed for the auto-updater. Set `TAURI_SIGNING_PRIVATE_KEY` to your own key, and put its public key in `tauri.conf.json`.
