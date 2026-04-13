use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, Position, Rect, Size, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

/// Update the tray icon badge overlay with the unused benefit count.
/// Exposed as a Tauri command so the frontend can call it after store mutations.
#[tauri::command]
fn update_tray_badge(app: tauri::AppHandle, count: i32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        let tooltip = if count > 0 {
            format!("Credit Card Benefits · {count} 项未使用")
        } else {
            "Credit Card Benefits · 全部已使用".to_string()
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Show / re-create the main window. Exposed as a Tauri command so the tray
/// panel can open the main window reliably (even if it was closed/hidden).
#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        // Re-create the main window if it was somehow destroyed
        if let Ok(win) = WebviewWindowBuilder::new(
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .invoke_handler(tauri::generate_handler![update_tray_badge, show_main_window])
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

            // Build tray icon. show_menu_on_left_click=false so left-click
            // fires the click handler directly instead of showing the menu.
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
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
