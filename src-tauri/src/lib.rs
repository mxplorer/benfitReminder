use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Update the tray icon badge overlay with the unused benefit count.
/// The badge is rendered as a text overlay on the tray icon.
/// Exposed as a Tauri command so the frontend can call it after store mutations.
#[tauri::command]
fn update_tray_badge(app: tauri::AppHandle, count: i32) {
    if let Some(tray) = app.tray_by_id("main-tray") {
        // Compose tooltip text with the count
        let tooltip = if count > 0 {
            format!("Credit Card Benefits · {count} 项未使用")
        } else {
            "Credit Card Benefits · 全部已使用".to_string()
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Create or toggle visibility of the tray panel window.
fn toggle_tray_panel(app: &tauri::AppHandle) {
    if let Some(tray_win) = app.get_webview_window("tray") {
        // Window exists — toggle visibility
        if tray_win.is_visible().unwrap_or(false) {
            let _ = tray_win.hide();
        } else {
            let _ = tray_win.show();
            let _ = tray_win.set_focus();
        }
    } else {
        // Create the tray panel window on demand
        let _ = WebviewWindowBuilder::new(app, "tray", WebviewUrl::App("index.html?window=tray".into()))
            .title("")
            .inner_size(420.0, 600.0)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .build();
    }
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
        .invoke_handler(tauri::generate_handler![update_tray_badge])
        .setup(|app| {
            // Show main window after setup (it starts hidden so frontend can hydrate first)
            if let Some(main_win) = app.get_webview_window("main") {
                let _ = main_win.show();
            }

            // Build right-click context menu
            let show_item = MenuItemBuilder::with_id("show", "显示 Benefits").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Build tray icon
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Credit Card Benefits")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => toggle_tray_panel(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click toggles the tray panel
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_tray_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
