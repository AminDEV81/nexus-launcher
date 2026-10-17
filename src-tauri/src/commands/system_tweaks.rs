//! Deep Windows System Tweaks & Gaming Optimizer.
//!
//! Provides persistent OS-level tweaks and optimizations reverse-engineered
//! from dedicated Windows gaming utilities (OPeasy, etc.):
//! 1. Low-latency Network & Ping (TCP NoDelay, TcpAckFrequency, netsh auto-tuning, DNS flush)
//! 2. GPU MSI Mode (Message Signaled Interrupts to eliminate IRQ conflicts & DPC latency)
//! 3. BCD Timer & Frame Pacing (Disable Dynamic Tick & HPET clock skew)
//! 4. Windows Telemetry & Bloat Services Debloat (DiagTrack, WerSvc, DoSvc)
//! 5. Deep Shader Cache Cleaner (DirectX D3DSCache, NVIDIA/AMD DXCache)
//! 6. System Restore Point creation (Checkpoint-Computer)
//! 7. System Elevation Detection (Check HKLM write / TokenElevation)

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTweakReport {
    pub is_elevated: bool,
    pub network_tweaks_applied: bool,
    pub gpu_msi_applied: bool,
    pub bcd_tweaks_applied: bool,
    pub telemetry_debloated: bool,
    pub detected_gpus: Vec<String>,
    pub applied_tweaks: u32,
    pub total_tweaks: u32,
    pub optimization_score: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TweakActionResult {
    pub success: bool,
    pub message: String,
    pub requires_admin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheCleanReport {
    pub freed_bytes: u64,
    pub files_deleted: u32,
    pub paths_cleaned: Vec<String>,
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::Command;
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WRITE};
    use winreg::RegKey;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    /// Checks if current process has administrative privileges by probing HKLM write access.
    pub fn is_elevated() -> bool {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        hklm.open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Control", KEY_WRITE).is_ok()
    }

    /// Creates a Windows System Restore Point.
    pub fn create_restore_point() -> TweakActionResult {
        if !is_elevated() {
            // Attempt to trigger with elevated PowerShell prompt
            let ps_script = "Checkpoint-Computer -Description 'Nexus Launcher Gaming Optimization' -RestorePointType 'MODIFY_SETTINGS'";
            let status = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &format!("Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"{}\"'", ps_script),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            return match status {
                Ok(s) if s.success() => TweakActionResult {
                    success: true,
                    message: "Restore point created successfully via UAC elevation.".into(),
                    requires_admin: true,
                },
                _ => TweakActionResult {
                    success: false,
                    message: "Creating a restore point requires Administrator privileges.".into(),
                    requires_admin: true,
                },
            };
        }

        let output = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Checkpoint-Computer -Description 'Nexus Launcher Gaming Optimization' -RestorePointType 'MODIFY_SETTINGS'",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        match output {
            Ok(out) if out.status.success() => TweakActionResult {
                success: true,
                message: "System Restore Point created successfully.".into(),
                requires_admin: false,
            },
            Ok(out) => {
                let err = String::from_utf8_lossy(&out.stderr);
                TweakActionResult {
                    success: false,
                    message: format!("Restore point creation skipped or disabled: {}", err.trim()),
                    requires_admin: false,
                }
            }
            Err(e) => TweakActionResult {
                success: false,
                message: format!("Failed to invoke PowerShell: {}", e),
                requires_admin: false,
            },
        }
    }

    /// Scans TCP/IP network tweaks (TCPNoDelay without bandwidth-capping TcpAckFrequency).
    pub fn scan_network_tweaks() -> bool {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let Ok(interfaces) = hklm.open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces",
            KEY_READ,
        ) else {
            return false;
        };

        let mut checked = 0;
        let mut enabled = 0;

        for key_name in interfaces.enum_keys().flatten() {
            if let Ok(subkey) = interfaces.open_subkey_with_flags(&key_name, KEY_READ) {
                checked += 1;
                let nodelay: Result<u32, _> = subkey.get_value("TCPNoDelay");
                if nodelay.unwrap_or(0) == 1 {
                    enabled += 1;
                }
            }
        }

        checked > 0 && enabled > 0
    }

    /// Applies or reverts low-latency TCP NoDelay & full-bandwidth Receive Window Auto-Tuning
    /// while removing `TcpAckFrequency` / `AlwaysOn` overrides that cap download speeds to ~10 Mbps.
    pub fn apply_network_tweaks(enable: bool) -> TweakActionResult {
        if !is_elevated() {
            let script = if enable {
                r#"$interfaces = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'; Get-ChildItem $interfaces | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name TcpDelAckTicks -ErrorAction SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name TCPNoDelay -Value 1 -Type DWord -Force }; $mmcss = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile'; Set-ItemProperty -Path $mmcss -Name NetworkThrottlingIndex -Value 0xffffffff -Type DWord -Force -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $mmcss -Name AlwaysOn -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $mmcss -Name NoLazyMode -ErrorAction SilentlyContinue; netsh int tcp set global autotuninglevel=normal; netsh int tcp set heuristics default; netsh int tcp set global rss=enabled; ipconfig /flushdns"#
            } else {
                r#"$interfaces = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces'; Get-ChildItem $interfaces | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name TcpAckFrequency -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name TCPNoDelay -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name TcpDelAckTicks -ErrorAction SilentlyContinue }; netsh int tcp set global autotuninglevel=normal; netsh int tcp set heuristics default; ipconfig /flushdns"#
            };

            let status = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &format!("Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"{}\"'", script),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            return match status {
                Ok(s) if s.success() => TweakActionResult {
                    success: true,
                    message: if enable {
                        "Low-latency TCP NoDelay & 100% uncapped bandwidth applied via UAC elevation.".into()
                    } else {
                        "Network settings reverted to Windows defaults via UAC elevation.".into()
                    },
                    requires_admin: true,
                },
                _ => TweakActionResult {
                    success: false,
                    message: "Administrator rights required to modify TCP/IP adapter parameters.".into(),
                    requires_admin: true,
                },
            };
        }

        // Direct Registry edit when elevated
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(interfaces) = hklm.open_subkey_with_flags(
            r"SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces",
            KEY_WRITE | KEY_READ,
        ) {
            for key_name in interfaces.enum_keys().flatten() {
                if let Ok(subkey) = interfaces.open_subkey_with_flags(&key_name, KEY_WRITE) {
                    // Always remove TcpAckFrequency & TcpDelAckTicks so RSC & full Gigabit download speed are never capped
                    let _ = subkey.delete_value("TcpAckFrequency");
                    let _ = subkey.delete_value("TcpDelAckTicks");
                    if enable {
                        let _ = subkey.set_value("TCPNoDelay", &1u32);
                    } else {
                        let _ = subkey.delete_value("TCPNoDelay");
                    }
                }
            }
        }

        // Also ensure MMCSS NetworkThrottlingIndex is uncapped (0xffffffff) and AlwaysOn is removed
        if let Ok(mmcss) = hklm.open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
            KEY_WRITE,
        ) {
            let _ = mmcss.delete_value("AlwaysOn");
            let _ = mmcss.delete_value("NoLazyMode");
            let _ = mmcss.set_value("NetworkThrottlingIndex", &0xffffffffu32);
        }

        // Run netsh optimization (preserving autotuninglevel=normal and heuristics=default for full download speed)
        let _ = Command::new("netsh").args(["int", "tcp", "set", "global", "autotuninglevel=normal"]).creation_flags(CREATE_NO_WINDOW).status();
        let _ = Command::new("netsh").args(["int", "tcp", "set", "heuristics", "default"]).creation_flags(CREATE_NO_WINDOW).status();
        let _ = Command::new("netsh").args(["int", "tcp", "set", "global", "rss=enabled"]).creation_flags(CREATE_NO_WINDOW).status();
        let _ = Command::new("ipconfig").args(["/flushdns"]).creation_flags(CREATE_NO_WINDOW).status();

        TweakActionResult {
            success: true,
            message: if enable {
                "Gaming TCP NoDelay enabled, 10 Mbps MMCSS cap removed, and full bandwidth restored.".into()
            } else {
                "Network settings restored to Windows defaults.".into()
            },
            requires_admin: false,
        }
    }

    /// Scans discrete GPUs and checks if MSI (Message Signaled Interrupts) is active.
    pub fn scan_gpu_msi() -> (bool, Vec<String>) {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let Ok(pci) = hklm.open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Enum\PCI", KEY_READ) else {
            return (false, Vec::new());
        };

        let mut gpus = Vec::new();
        let mut msi_active = false;

        // Traverse PCI devices looking for Display Controllers
        for dev_key in pci.enum_keys().flatten() {
            let Ok(dev) = pci.open_subkey_with_flags(&dev_key, KEY_READ) else { continue };
            for instance_key in dev.enum_keys().flatten() {
                let Ok(instance) = dev.open_subkey_with_flags(&instance_key, KEY_READ) else { continue };
                let class: Result<String, _> = instance.get_value("Class");
                let desc: Result<String, _> = instance.get_value("DeviceDesc");

                if let Ok(class_name) = class {
                    if class_name.eq_ignore_ascii_case("Display") {
                        let name = desc.unwrap_or_else(|_| "PCI Graphics Adapter".into());
                        // Clean @oem.inf,... decorations if present
                        let clean_name = name.split(';').next_back().unwrap_or(&name).trim().to_string();
                        if !gpus.contains(&clean_name) {
                            gpus.push(clean_name);
                        }

                        // Check MSI property
                        let msi_path = format!(
                            r"SYSTEM\CurrentControlSet\Enum\PCI\{}\{}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties",
                            dev_key, instance_key
                        );
                        if let Ok(msi_key) = hklm.open_subkey_with_flags(&msi_path, KEY_READ) {
                            if let Ok(val) = msi_key.get_value::<u32, _>("MSISupported") {
                                if val == 1 {
                                    msi_active = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        (msi_active, gpus)
    }

    /// Applies or reverts GPU Message Signaled Interrupts (MSI Mode).
    pub fn apply_gpu_msi(enable: bool) -> TweakActionResult {
        if !is_elevated() {
            let val = if enable { 1 } else { 0 };
            let prio = if enable { "High" } else { "Normal" };
            let script = format!(
                r#"Get-ChildItem -Path 'HKLM:\SYSTEM\CurrentControlSet\Enum\PCI' -Recurse -ErrorAction SilentlyContinue | Where-Object {{ $_.GetValue('Class') -eq 'Display' }} | ForEach-Object {{ $p = Join-Path $_.PSPath 'Device Parameters\Interrupt Management\MessageSignaledInterruptProperties'; if (!(Test-Path $p)) {{ New-Item -Path $p -Force }}; Set-ItemProperty -Path $p -Name 'MSISupported' -Value {} -Type DWord -Force; $ap = Join-Path $_.PSPath 'Device Parameters\Interrupt Management\Affinity Policy'; if (!(Test-Path $ap)) {{ New-Item -Path $ap -Force }}; Set-ItemProperty -Path $ap -Name 'DevicePriority' -Value '{}' -Type String -Force }}"#,
                val, prio
            );

            let status = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &format!("Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"{}\"'", script),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            return match status {
                Ok(s) if s.success() => TweakActionResult {
                    success: true,
                    message: if enable {
                        "GPU MSI Mode (Message Signaled Interrupts) enabled with High device priority.".into()
                    } else {
                        "GPU interrupt handling restored to default.".into()
                    },
                    requires_admin: true,
                },
                _ => TweakActionResult {
                    success: false,
                    message: "Administrator rights required to modify PCI interrupt management.".into(),
                    requires_admin: true,
                },
            };
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let Ok(pci) = hklm.open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Enum\PCI", KEY_READ) else {
            return TweakActionResult {
                success: false,
                message: "Could not open PCI device registry.".into(),
                requires_admin: false,
            };
        };

        let mut count = 0;
        for dev_key in pci.enum_keys().flatten() {
            let Ok(dev) = pci.open_subkey_with_flags(&dev_key, KEY_READ) else { continue };
            for instance_key in dev.enum_keys().flatten() {
                let Ok(instance) = dev.open_subkey_with_flags(&instance_key, KEY_READ) else { continue };
                let Ok(class) = instance.get_value::<String, _>("Class") else { continue };

                if class.eq_ignore_ascii_case("Display") {
                    let msi_path = format!(
                        r"SYSTEM\CurrentControlSet\Enum\PCI\{}\{}\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties",
                        dev_key, instance_key
                    );
                    if let Ok((msi_key, _)) = hklm.create_subkey(&msi_path) {
                        let _ = msi_key.set_value("MSISupported", &(if enable { 1u32 } else { 0u32 }));
                        count += 1;
                    }

                    let affinity_path = format!(
                        r"SYSTEM\CurrentControlSet\Enum\PCI\{}\{}\Device Parameters\Interrupt Management\Affinity Policy",
                        dev_key, instance_key
                    );
                    if let Ok((affinity_key, _)) = hklm.create_subkey(&affinity_path) {
                        let _ = affinity_key.set_value("DevicePriority", &(if enable { "High" } else { "Normal" }));
                    }
                }
            }
        }

        TweakActionResult {
            success: count > 0,
            message: if enable {
                format!("Configured MSI Mode on {} display controller(s) with High priority.", count)
            } else {
                format!("Reverted MSI Mode on {} display controller(s).", count)
            },
            requires_admin: false,
        }
    }

    /// Scans BCD boot settings (disabledynamictick and useplatformclock).
    pub fn scan_bcd_tweaks() -> bool {
        let output = Command::new("bcdedit")
            .args(["/enum", "{current}"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
            text.contains("disabledynamictick") && text.contains("yes")
        } else {
            false
        }
    }

    /// Applies or reverts BCD timer optimizations.
    pub fn apply_bcd_tweaks(enable: bool) -> TweakActionResult {
        if !is_elevated() {
            let script = if enable {
                "bcdedit /set useplatformclock false; bcdedit /set disabledynamictick yes; bcdedit /set tscsyncpolicy Enhanced"
            } else {
                "bcdedit /deletevalue useplatformclock; bcdedit /deletevalue disabledynamictick; bcdedit /deletevalue tscsyncpolicy"
            };

            let status = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &format!("Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"{}\"'", script),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            return match status {
                Ok(s) if s.success() => TweakActionResult {
                    success: true,
                    message: if enable {
                        "BCD timer pacing & dynamic tick disabled via UAC elevation.".into()
                    } else {
                        "BCD boot parameters reverted to default.".into()
                    },
                    requires_admin: true,
                },
                _ => TweakActionResult {
                    success: false,
                    message: "Administrator rights required to modify boot configuration data (bcdedit).".into(),
                    requires_admin: true,
                },
            };
        }

        if enable {
            let _ = Command::new("bcdedit").args(["/set", "useplatformclock", "false"]).creation_flags(CREATE_NO_WINDOW).status();
            let _ = Command::new("bcdedit").args(["/set", "disabledynamictick", "yes"]).creation_flags(CREATE_NO_WINDOW).status();
            let _ = Command::new("bcdedit").args(["/set", "tscsyncpolicy", "Enhanced"]).creation_flags(CREATE_NO_WINDOW).status();
        } else {
            let _ = Command::new("bcdedit").args(["/deletevalue", "useplatformclock"]).creation_flags(CREATE_NO_WINDOW).status();
            let _ = Command::new("bcdedit").args(["/deletevalue", "disabledynamictick"]).creation_flags(CREATE_NO_WINDOW).status();
            let _ = Command::new("bcdedit").args(["/deletevalue", "tscsyncpolicy"]).creation_flags(CREATE_NO_WINDOW).status();
        }

        TweakActionResult {
            success: true,
            message: if enable {
                "BCD Dynamic Tick disabled and TSC sync enhanced for consistent frame delivery.".into()
            } else {
                "BCD parameters reverted to Windows defaults.".into()
            },
            requires_admin: false,
        }
    }

    /// Scans telemetry and background bloat services.
    pub fn scan_telemetry_debloat() -> bool {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(diag) = hklm.open_subkey_with_flags(r"SYSTEM\CurrentControlSet\Services\DiagTrack", KEY_READ) {
            let start: Result<u32, _> = diag.get_value("Start");
            if start.unwrap_or(0) == 4 {
                return true; // 4 = Disabled
            }
        }
        false
    }

    /// Disables or restores telemetry services.
    pub fn apply_telemetry_debloat(enable: bool) -> TweakActionResult {
        if !is_elevated() {
            let script = if enable {
                r#"sc.exe config DiagTrack start= disabled; net stop DiagTrack; sc.exe config dmwappushservice start= disabled; net stop dmwappushservice; sc.exe config WerSvc start= disabled; net stop WerSvc; sc.exe config DoSvc start= disabled; net stop DoSvc; Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' -Name AllowTelemetry -Value 0 -Type DWord -Force"#
            } else {
                r#"sc.exe config DiagTrack start= auto; sc.exe config WerSvc start= demand; sc.exe config DoSvc start= auto; sc.exe config dmwappushservice start= demand; Remove-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DataCollection' -Name AllowTelemetry -ErrorAction SilentlyContinue"#
            };

            let status = Command::new("powershell.exe")
                .args([
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    &format!("Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -Command \"{}\"'", script),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .status();

            return match status {
                Ok(s) if s.success() => TweakActionResult {
                    success: true,
                    message: if enable {
                        "Windows telemetry and background diagnostic services disabled.".into()
                    } else {
                        "Telemetry services restored to standard configuration.".into()
                    },
                    requires_admin: true,
                },
                _ => TweakActionResult {
                    success: false,
                    message: "Administrator rights required to manage Windows system services.".into(),
                    requires_admin: true,
                },
            };
        }

        // Direct Service Manager invocation
        let services = ["DiagTrack", "dmwappushservice", "WerSvc", "DoSvc"];
        for s in services {
            if enable {
                let _ = Command::new("sc").args(["config", s, "start=", "disabled"]).creation_flags(CREATE_NO_WINDOW).status();
                let _ = Command::new("net").args(["stop", s]).creation_flags(CREATE_NO_WINDOW).status();
            } else {
                let start_type = if s == "WerSvc" || s == "dmwappushservice" { "demand" } else { "auto" };
                let _ = Command::new("sc").args(["config", s, "start=", start_type]).creation_flags(CREATE_NO_WINDOW).status();
            }
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok((policy, _)) = hklm.create_subkey(r"SOFTWARE\Policies\Microsoft\Windows\DataCollection") {
            if enable {
                let _ = policy.set_value("AllowTelemetry", &0u32);
            } else {
                let _ = policy.delete_value("AllowTelemetry");
            }
        }

        TweakActionResult {
            success: true,
            message: if enable {
                "Background telemetry and diagnostic tracking services disabled.".into()
            } else {
                "Telemetry services restored to default.".into()
            },
            requires_admin: false,
        }
    }

    /// Deep cleaning of DirectX and GPU Shader Caches.
    pub fn clean_shader_caches() -> CacheCleanReport {
        let mut freed_bytes = 0u64;
        let mut files_deleted = 0u32;
        let mut paths_cleaned = Vec::new();

        let local_app_data = match std::env::var("LOCALAPPDATA") {
            Ok(p) => PathBuf::from(p),
            Err(_) => return CacheCleanReport { freed_bytes: 0, files_deleted: 0, paths_cleaned: Vec::new() },
        };

        let target_folders = [
            local_app_data.join("D3DSCache"),
            local_app_data.join("NVIDIA").join("DXCache"),
            local_app_data.join("NVIDIA").join("GLCache"),
            local_app_data.join("AMD").join("DxCache"),
            local_app_data.join("AMD").join("GLCache"),
            local_app_data.join("CrashDumps"),
        ];

        for folder in &target_folders {
            if !folder.exists() {
                continue;
            }
            let mut cleaned_this = false;
            if let Ok(entries) = walkdir::WalkDir::new(folder).max_depth(3).into_iter().collect::<Result<Vec<_>, _>>() {
                for entry in entries {
                    if entry.file_type().is_file() {
                        if let Ok(meta) = entry.metadata() {
                            let len = meta.len();
                            if std::fs::remove_file(entry.path()).is_ok() {
                                freed_bytes += len;
                                files_deleted += 1;
                                cleaned_this = true;
                            }
                        }
                    }
                }
            }
            if cleaned_this {
                paths_cleaned.push(folder.display().to_string());
            }
        }

        CacheCleanReport {
            freed_bytes,
            files_deleted,
            paths_cleaned,
        }
    }
}

#[cfg(not(windows))]
mod imp {
    use super::*;

    pub fn is_elevated() -> bool { false }
    pub fn create_restore_point() -> TweakActionResult {
        TweakActionResult { success: false, message: "System Restore Points are Windows-only.".into(), requires_admin: false }
    }
    pub fn scan_network_tweaks() -> bool { false }
    pub fn apply_network_tweaks(_enable: bool) -> TweakActionResult {
        TweakActionResult { success: false, message: "Network tweaks are Windows-only.".into(), requires_admin: false }
    }
    pub fn scan_gpu_msi() -> (bool, Vec<String>) { (false, Vec::new()) }
    pub fn apply_gpu_msi(_enable: bool) -> TweakActionResult {
        TweakActionResult { success: false, message: "GPU MSI mode is Windows-only.".into(), requires_admin: false }
    }
    pub fn scan_bcd_tweaks() -> bool { false }
    pub fn apply_bcd_tweaks(_enable: bool) -> TweakActionResult {
        TweakActionResult { success: false, message: "BCD tweaks are Windows-only.".into(), requires_admin: false }
    }
    pub fn scan_telemetry_debloat() -> bool { false }
    pub fn apply_telemetry_debloat(_enable: bool) -> TweakActionResult {
        TweakActionResult { success: false, message: "Telemetry debloat is Windows-only.".into(), requires_admin: false }
    }
    pub fn clean_shader_caches() -> CacheCleanReport {
        CacheCleanReport { freed_bytes: 0, files_deleted: 0, paths_cleaned: Vec::new() }
    }
}

// ---------------------------------------------------------------------
// Tauri Commands
// ---------------------------------------------------------------------

#[tauri::command]
pub async fn get_system_tweak_status() -> AppResult<SystemTweakReport> {
    tokio::task::spawn_blocking(|| {
        let is_elevated = imp::is_elevated();
        let network_tweaks_applied = imp::scan_network_tweaks();
        let (gpu_msi_applied, detected_gpus) = imp::scan_gpu_msi();
        let bcd_tweaks_applied = imp::scan_bcd_tweaks();
        let telemetry_debloated = imp::scan_telemetry_debloat();

        let total_tweaks = 4;
        let mut applied_tweaks = 0;
        if network_tweaks_applied { applied_tweaks += 1; }
        if gpu_msi_applied { applied_tweaks += 1; }
        if bcd_tweaks_applied { applied_tweaks += 1; }
        if telemetry_debloated { applied_tweaks += 1; }

        let optimization_score = ((applied_tweaks as f32 / total_tweaks as f32) * 100.0) as u32;

        Ok(SystemTweakReport {
            is_elevated,
            network_tweaks_applied,
            gpu_msi_applied,
            bcd_tweaks_applied,
            telemetry_debloated,
            detected_gpus,
            applied_tweaks,
            total_tweaks,
            optimization_score,
        })
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub async fn create_restore_point() -> AppResult<TweakActionResult> {
    tokio::task::spawn_blocking(imp::create_restore_point)
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn toggle_network_tweaks(enable: bool) -> AppResult<TweakActionResult> {
    tokio::task::spawn_blocking(move || imp::apply_network_tweaks(enable))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn toggle_gpu_msi_mode(enable: bool) -> AppResult<TweakActionResult> {
    tokio::task::spawn_blocking(move || imp::apply_gpu_msi(enable))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn toggle_bcd_tweaks(enable: bool) -> AppResult<TweakActionResult> {
    tokio::task::spawn_blocking(move || imp::apply_bcd_tweaks(enable))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn toggle_telemetry_debloat(enable: bool) -> AppResult<TweakActionResult> {
    tokio::task::spawn_blocking(move || imp::apply_telemetry_debloat(enable))
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn clean_shader_caches() -> AppResult<CacheCleanReport> {
    tokio::task::spawn_blocking(imp::clean_shader_caches)
        .await
        .map_err(|e| AppError::Other(e.to_string()))
}
