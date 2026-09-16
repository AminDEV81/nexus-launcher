fn main() {
    // Release builds always run elevated (requireAdministrator via the
    // embedded manifest). Debug builds keep the default manifest so
    // `tauri dev` doesn't trigger a UAC prompt on every rebuild.
    if cfg!(debug_assertions) {
        tauri_build::build();
    } else {
        let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest"));
        tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
            .expect("failed to run tauri-build");
    }
}
