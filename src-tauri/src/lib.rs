use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position, Rect, Size, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

/// Preloaded tray icon variants — one per visual state, bundled at compile time.
struct TrayIcons {
    clean: Image<'static>,
    unused: Image<'static>,
    urgent: Image<'static>,
}

impl TrayIcons {
    fn pick(&self, state: &str) -> &Image<'static> {
        match state {
            "urgent" => &self.urgent,
            "unused" => &self.unused,
            _ => &self.clean,
        }
    }
}

/// Update the tray icon + tooltip to reflect the current benefit status.
/// Exposed as a Tauri command so the frontend can call it after store mutations.
#[tauri::command]
fn update_tray_status(
    app: tauri::AppHandle,
    icons: State<'_, TrayIcons>,
    state: &str,
    unused_count: i32,
    urgent_count: i32,
) {
    let Some(tray) = app.tray_by_id("main-tray") else {
        return;
    };

    let _ = tray.set_icon(Some(icons.pick(state).clone()));

    let tooltip = match state {
        "urgent" => format!(
            "Credit Card Benefits · {unused_count} 项未使用（{urgent_count} 项即将到期）"
        ),
        "unused" => format!("Credit Card Benefits · {unused_count} 项未使用"),
        _ => "Credit Card Benefits · 全部已使用".to_string(),
    };
    let _ = tray.set_tooltip(Some(&tooltip));
}

/// Show / re-create the main window. Exposed as a Tauri command so the tray
/// panel can open the main window reliably (even if it was closed/hidden).
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else if let Ok(win) = WebviewWindowBuilder::new(
        &app,
        "main",
        WebviewUrl::App("index.html".into()),
    )
    .title("Credit Card Benefits")
    .inner_size(1024.0, 768.0)
    .build()
    {
        let _ = win.set_focus();
    }
}

/// Toggle the tray panel like a macOS menu bar dropdown: anchored below the
/// tray icon, auto-hidden when it loses focus.
///
/// The tray window is pre-declared in tauri.conf.json with `transparent: true`
/// and `visible: false`, so we only show/hide/position it here.
fn toggle_tray_panel(app: &tauri::AppHandle, icon_rect: Option<Rect>) {
    let Some(tray_win) = app.get_webview_window("tray") else {
        return;
    };
    if tray_win.is_visible().unwrap_or(false) {
        let _ = tray_win.hide();
        return;
    }
    if let Some(rect) = icon_rect {
        anchor_window_to_icon(&tray_win, rect);
    }
    let _ = tray_win.show();
    let _ = tray_win.set_focus();
}

/// Position the window so its horizontal center aligns with the tray icon
/// center, placed just below the icon (works for the macOS menu bar).
fn anchor_window_to_icon(win: &WebviewWindow, icon_rect: Rect) {
    let scale = win.scale_factor().unwrap_or(1.0);
    let (icon_x, icon_y, icon_w, icon_h) = rect_to_physical(icon_rect, scale);
    let Ok(win_size) = win.outer_size() else { return };
    let win_w = f64::from(win_size.width);
    let x = icon_x + icon_w / 2.0 - win_w / 2.0;
    let y = icon_y + icon_h + 2.0;
    let _ = win.set_position(PhysicalPosition::new(x, y));
}

/// Convert a tauri::Rect into physical (x, y, width, height) floats.
fn rect_to_physical(rect: Rect, scale: f64) -> (f64, f64, f64, f64) {
    let (x, y) = match rect.position {
        Position::Physical(p) => (f64::from(p.x), f64::from(p.y)),
        Position::Logical(p) => (p.x * scale, p.y * scale),
    };
    let (w, h) = match rect.size {
        Size::Physical(s) => (f64::from(s.width), f64::from(s.height)),
        Size::Logical(s) => (s.width * scale, s.height * scale),
    };
    (x, y, w, h)
}

/// Decode a bundled PNG byte slice into a Tauri `Image<'static>`. The input is
/// built by `scripts/build-tray-icons.mjs`, so a decode failure is a build bug.
fn load_icon(bytes: &'static [u8]) -> Image<'static> {
    Image::from_bytes(bytes).expect("bundled tray icon PNG must be valid")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tray_icons = TrayIcons {
        clean: load_icon(include_bytes!("../icons/tray/tray-clean@2x.png")),
        unused: load_icon(include_bytes!("../icons/tray/tray-unused@2x.png")),
        urgent: load_icon(include_bytes!("../icons/tray/tray-urgent@2x.png")),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(tray_icons)
        .invoke_handler(tauri::generate_handler![update_tray_status, show_main_window])
        .setup(|app| {
            // Tray-app pattern: closing the main window hides it rather than
            // destroying it, so the app keeps running in the menu bar.
            if let Some(main_win) = app.get_webview_window("main") {
                let hide_target = main_win.clone();
                main_win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hide_target.hide();
                    }
                });
            }

            // Tray panel: auto-hide on focus loss (dropdown behavior).
            if let Some(tray_win) = app.get_webview_window("tray") {
                let hide_target = tray_win.clone();
                tray_win.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        let _ = hide_target.hide();
                    }
                });
            }

            // Right-click context menu: quit only.
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).item(&quit_item).build()?;

            // Initial icon is the `clean` variant; the frontend will push the
            // real state right after hydration. Template mode is OFF: our PNGs
            // carry a white halo and a colored status dot, both of which must
            // render with their true RGB values. Template mode would flatten
            // everything to a single tinted shape keyed on alpha.
            let initial_icon = app.state::<TrayIcons>().clean.clone();
            TrayIconBuilder::with_id("main-tray")
                .icon(initial_icon)
                .icon_as_template(false)
                .tooltip("Credit Card Benefits")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    if event.id().as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        toggle_tray_panel(tray.app_handle(), Some(rect));
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    // Byte-equality of `Image::from_bytes(&raw)` is not available directly, so
    // we anchor `pick` against the raw PNG bytes each variant was built from.
    // If someone swaps the wiring (e.g. points `unused` at the clean PNG), the
    // `pick` branch table will stop matching the expected file and fail.
    const CLEAN_BYTES: &[u8] = include_bytes!("../icons/tray/tray-clean@2x.png");
    const UNUSED_BYTES: &[u8] = include_bytes!("../icons/tray/tray-unused@2x.png");
    const URGENT_BYTES: &[u8] = include_bytes!("../icons/tray/tray-urgent@2x.png");

    fn fixture() -> TrayIcons {
        TrayIcons {
            clean: load_icon(CLEAN_BYTES),
            unused: load_icon(UNUSED_BYTES),
            urgent: load_icon(URGENT_BYTES),
        }
    }

    fn ptr(image: &Image<'_>) -> *const u8 {
        image.rgba().as_ptr()
    }

    #[test]
    fn pick_returns_urgent_for_urgent_state() {
        let icons = fixture();
        assert_eq!(ptr(icons.pick("urgent")), ptr(&icons.urgent));
    }

    #[test]
    fn pick_returns_unused_for_unused_state() {
        let icons = fixture();
        assert_eq!(ptr(icons.pick("unused")), ptr(&icons.unused));
    }

    #[test]
    fn pick_returns_clean_for_clean_state() {
        let icons = fixture();
        assert_eq!(ptr(icons.pick("clean")), ptr(&icons.clean));
    }

    #[test]
    fn pick_falls_back_to_clean_for_unknown_state() {
        let icons = fixture();
        assert_eq!(ptr(icons.pick("bogus")), ptr(&icons.clean));
    }
}
