// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix WebKitGTK DMA-BUF rendering glitch on Wayland compositors (Hyprland, Sway, GNOME Wayland with Nvidia, etc.)
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // Fix AppImage forced GDK_BACKEND=x11 on pure Wayland compositors (Hyprland, Sway):
        // linuxdeploy-plugin-gtk inside AppImages forces GDK_BACKEND=x11 by default.
        // On Hyprland, this causes the process to hang in background with no window.
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            if let Ok(backend) = std::env::var("GDK_BACKEND") {
                if backend == "x11" {
                    std::env::set_var("GDK_BACKEND", "wayland,x11");
                }
            }
        }
    }

    app_lib::run();
}
