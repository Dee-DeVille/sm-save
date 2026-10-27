use std::io::{BufRead, BufReader};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

static ACTIVE_DOWNLOAD_PIDS: Mutex<Vec<u32>> = Mutex::new(Vec::new());

fn prevent_cmd_window(cmd: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    {
        let _ = cmd;
    }
}

#[tauri::command]
fn kill_process(pid: u32) -> Result<(), String> {
    let mut pids_to_kill = Vec::new();
    if pid > 0 {
        pids_to_kill.push(pid);
    }
    if let Ok(mut active) = ACTIVE_DOWNLOAD_PIDS.lock() {
        if pid == 0 {
            pids_to_kill.extend(active.drain(..));
        } else {
            active.retain(|&p| p != pid);
        }
    }

    for p in pids_to_kill {
        if p == 0 {
            continue;
        }

        #[cfg(unix)]
        {
            // 1. Direct POSIX syscall: kill the entire process group (-p) and the process (p)
            let pgid = -(p as i32);
            unsafe {
                libc::kill(pgid, libc::SIGKILL);
                libc::kill(p as i32, libc::SIGKILL);
            }

            // 2. Guaranteed fallback using absolute binary path
            let _ = std::process::Command::new("/bin/kill")
                .args(["-9", &format!("-{}", p)])
                .status();
            let _ = std::process::Command::new("/bin/kill")
                .args(["-9", &p.to_string()])
                .status();

            // 3. Kill any child processes by parent PID
            let _ = std::process::Command::new("/usr/bin/pkill")
                .args(["-9", "-P", &p.to_string()])
                .status();
        }

        #[cfg(windows)]
        {
            use std::process::Command;
            let mut cmd = Command::new("taskkill");
            prevent_cmd_window(&mut cmd);
            let _ = cmd
                .args(["/F", "/T", "/PID", &p.to_string()])
                .status();
        }
    }

    Ok(())
}

#[tauri::command]
fn get_exe_dir(app: tauri::AppHandle) -> Result<String, String> {
    let (ffmpeg_name, ffprobe_name) = if cfg!(windows) {
        ("ffmpeg.exe", "ffprobe.exe")
    } else {
        ("ffmpeg", "ffprobe")
    };

    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or_else(|| "Failed to resolve executable parent directory".to_string())?
        .to_path_buf();

    // 1. Check if bare ffmpeg/ffprobe exist beside the executable (Production bundled mode)
    let ffmpeg_src = exe_dir.join(ffmpeg_name);
    let ffprobe_src = exe_dir.join(ffprobe_name);

    if ffmpeg_src.exists() && ffprobe_src.exists() {
        return Ok(exe_dir.to_string_lossy().to_string());
    }

    // 2. Check macOS app bundle Resources folder (if applicable)
    if let Some(parent) = exe_dir.parent() {
        let resources_dir = parent.join("Resources");
        if resources_dir.join(ffmpeg_name).exists() && resources_dir.join(ffprobe_name).exists() {
            return Ok(resources_dir.to_string_lossy().to_string());
        }
    }

    // 3. Development mode fallback: Look for binaries in src-tauri/bin with target triples
    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    if !cache_dir.exists() {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }

    let ffmpeg_dest = cache_dir.join(ffmpeg_name);
    let ffprobe_dest = cache_dir.join(ffprobe_name);

    let candidate_dirs = [
        exe_dir.join("../../../src-tauri/bin"),
        exe_dir.join("../../bin"),
        exe_dir.join("bin"),
        std::path::PathBuf::from("src-tauri/bin"),
        std::path::PathBuf::from("bin"),
    ];

    let copy_if_needed = |src: &std::path::Path, dest: &std::path::Path| -> Result<(), String> {
        let should_copy = if dest.exists() {
            let src_len = std::fs::metadata(src).map(|m| m.len()).ok();
            let dest_len = std::fs::metadata(dest).map(|m| m.len()).ok();
            src_len != dest_len
        } else {
            true
        };
        if should_copy {
            std::fs::copy(src, dest).map_err(|e| e.to_string())?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(dest).map_err(|e| e.to_string())?.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(dest, perms).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    };

    let target_triple_ext = if cfg!(windows) {
        "x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let target_ffmpeg = format!("ffmpeg-{}", target_triple_ext);
    let target_ffprobe = format!("ffprobe-{}", target_triple_ext);

    for bin_dir in &candidate_dirs {
        if bin_dir.is_dir() {
            let f_candidate = bin_dir.join(&target_ffmpeg);
            let p_candidate = bin_dir.join(&target_ffprobe);
            if f_candidate.exists() && p_candidate.exists() {
                copy_if_needed(&f_candidate, &ffmpeg_dest)?;
                copy_if_needed(&p_candidate, &ffprobe_dest)?;
                return Ok(cache_dir.to_string_lossy().to_string());
            }

            // Bare name fallback in candidate bin directory
            let f_bare = bin_dir.join(ffmpeg_name);
            let p_bare = bin_dir.join(ffprobe_name);
            if f_bare.exists() && p_bare.exists() {
                copy_if_needed(&f_bare, &ffmpeg_dest)?;
                copy_if_needed(&p_bare, &ffprobe_dest)?;
                return Ok(cache_dir.to_string_lossy().to_string());
            }
        }
    }

    // If cache_dir already has ffmpeg/ffprobe from previous dev runs, return it
    if ffmpeg_dest.exists() && ffprobe_dest.exists() {
        return Ok(cache_dir.to_string_lossy().to_string());
    }

    Err(format!(
        "ffmpeg/ffprobe binaries not found next to executable or in bin directory."
    ))
}

fn resolve_active_ytdlp_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let ytdlp_name = if cfg!(windows) {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };

    // 1. Check if a dynamically updated binary exists in app_data_dir/bin/
    if let Ok(app_data) = app.path().app_data_dir() {
        let dynamic_path = app_data.join("bin").join(ytdlp_name);
        if dynamic_path.exists() {
            return Ok(dynamic_path);
        }
    }

    // 2. Check beside the running executable (Production bundled mode)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let bundled_path = exe_dir.join(ytdlp_name);
            if bundled_path.exists() {
                return Ok(bundled_path);
            }
            if let Some(parent) = exe_dir.parent() {
                let res_path = parent.join("Resources").join(ytdlp_name);
                if res_path.exists() {
                    return Ok(res_path);
                }
            }
        }
    }

    // 3. Development mode fallback: Look in target/debug or src-tauri/bin
    let target_triple_ext = if cfg!(windows) {
        "x86_64-pc-windows-msvc.exe"
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "aarch64-apple-darwin"
        } else {
            "x86_64-apple-darwin"
        }
    } else {
        "x86_64-unknown-linux-gnu"
    };

    let target_ytdlp = format!("yt-dlp-{}", target_triple_ext);
    let dev_candidates = [
        std::path::PathBuf::from(format!("target/debug/{ytdlp_name}")),
        std::path::PathBuf::from(format!("src-tauri/target/debug/{ytdlp_name}")),
        std::path::PathBuf::from(format!("src-tauri/bin/{target_ytdlp}")),
        std::path::PathBuf::from(format!("bin/{target_ytdlp}")),
    ];

    for candidate in &dev_candidates {
        if candidate.exists() {
            return Ok(std::fs::canonicalize(candidate).unwrap_or_else(|_| candidate.clone()));
        }
    }

    Err("yt-dlp binary could not be found. Ensure external binaries are installed.".to_string())
}

#[derive(serde::Serialize)]
pub struct YtDlpUpdateInfo {
    current_version: String,
    latest_version: String,
    update_available: bool,
    active_path: String,
}

#[tauri::command]
async fn check_ytdlp_update(app: tauri::AppHandle) -> Result<YtDlpUpdateInfo, String> {
    let ytdlp_path = resolve_active_ytdlp_path(&app)?;

    let mut cmd = std::process::Command::new(&ytdlp_path);
    prevent_cmd_window(&mut cmd);
    let output = cmd
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to check current yt-dlp version: {e}"))?;

    let current_version = String::from_utf8_lossy(&output.stdout).trim().to_string();

    let client = reqwest::Client::builder()
        .user_agent("SM-SAVE-Updater")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get("https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest")
        .send()
        .await
        .map_err(|e| format!("Failed to query GitHub for updates: {e}"))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse release response: {e}"))?;

    let latest_tag = json["tag_name"]
        .as_str()
        .ok_or_else(|| "Missing tag_name in release info".to_string())?;

    let latest_version = latest_tag.trim().trim_start_matches('v').to_string();
    let update_available = !current_version.is_empty()
        && !latest_version.is_empty()
        && current_version != latest_version;

    Ok(YtDlpUpdateInfo {
        current_version,
        latest_version,
        update_available,
        active_path: ytdlp_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn install_ytdlp_update(app: tauri::AppHandle) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bin_dir = app_data.join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let (asset_name, dest_name) = if cfg!(windows) {
        ("yt-dlp.exe", "yt-dlp.exe")
    } else if cfg!(target_os = "macos") {
        ("yt-dlp_macos", "yt-dlp")
    } else {
        ("yt-dlp_linux", "yt-dlp")
    };

    let download_url = format!("https://github.com/yt-dlp/yt-dlp/releases/latest/download/{asset_name}");

    let client = reqwest::Client::builder()
        .user_agent("SM-SAVE-Updater")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download yt-dlp release asset: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("Download failed with status: {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| format!("Failed to read asset bytes: {e}"))?;
    let dest_path = bin_dir.join(dest_name);
    let tmp_path = bin_dir.join(format!("{dest_name}.tmp"));

    std::fs::write(&tmp_path, &bytes).map_err(|e| format!("Failed to write binary: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&tmp_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&tmp_path, perms).map_err(|e| e.to_string())?;
    }

    std::fs::rename(&tmp_path, &dest_path).map_err(|e| format!("Failed to replace binary: {e}"))?;

    let mut cmd = std::process::Command::new(&dest_path);
    prevent_cmd_window(&mut cmd);
    let verify = cmd
        .arg("--version")
        .output()
        .map_err(|e| format!("Failed to execute updated binary: {e}"))?;

    let new_version = String::from_utf8_lossy(&verify.stdout).trim().to_string();
    Ok(new_version)
}

fn find_js_runtime(app: &tauri::AppHandle) -> Option<(String, std::path::PathBuf)> {
    let (qjs_name, deno_name, node_name, bun_name) = if cfg!(windows) {
        ("qjs.exe", "deno.exe", "node.exe", "bun.exe")
    } else {
        ("qjs", "deno", "node", "bun")
    };

    // 1. Check in app_data_dir/bin/ (dynamically downloaded or installed runtimes)
    if let Ok(app_data) = app.path().app_data_dir() {
        let bin_dir = app_data.join("bin");
        let qjs_path = bin_dir.join(qjs_name);
        if qjs_path.exists() {
            return Some(("quickjs".to_string(), qjs_path));
        }
        let deno_path = bin_dir.join(deno_name);
        if deno_path.exists() {
            return Some(("deno".to_string(), deno_path));
        }
        let node_path = bin_dir.join(node_name);
        if node_path.exists() {
            return Some(("node".to_string(), node_path));
        }
        let bun_path = bin_dir.join(bun_name);
        if bun_path.exists() {
            return Some(("bun".to_string(), bun_path));
        }
    }

    // 2. Check beside running executable (Production bundled mode)
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let qjs_path = exe_dir.join(qjs_name);
            if qjs_path.exists() {
                return Some(("quickjs".to_string(), qjs_path));
            }
            let deno_path = exe_dir.join(deno_name);
            if deno_path.exists() {
                return Some(("deno".to_string(), deno_path));
            }
            let node_path = exe_dir.join(node_name);
            if node_path.exists() {
                return Some(("node".to_string(), node_path));
            }

            if let Some(parent) = exe_dir.parent() {
                let res_dir = parent.join("Resources");
                if res_dir.join(qjs_name).exists() {
                    return Some(("quickjs".to_string(), res_dir.join(qjs_name)));
                }
                if res_dir.join(deno_name).exists() {
                    return Some(("deno".to_string(), res_dir.join(deno_name)));
                }
                if res_dir.join(node_name).exists() {
                    return Some(("node".to_string(), res_dir.join(node_name)));
                }
            }
        }
    }

    // 3. Check well-known system paths (especially on Windows where PATH might not be updated in desktop shortcuts)
    #[cfg(windows)]
    {
        let win_candidates = [
            ("node", r"C:\Program Files\nodejs\node.exe"),
            ("node", r"C:\Program Files (x86)\nodejs\node.exe"),
        ];
        for (name, path_str) in win_candidates {
            let p = std::path::PathBuf::from(path_str);
            if p.exists() {
                return Some((name.to_string(), p));
            }
        }

        if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
            let p = std::path::PathBuf::from(&local_appdata).join("Programs").join("node.exe");
            if p.exists() {
                return Some(("node".to_string(), p));
            }
            let p2 = std::path::PathBuf::from(&local_appdata).join("Programs").join("nodejs").join("node.exe");
            if p2.exists() {
                return Some(("node".to_string(), p2));
            }
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            let p = std::path::PathBuf::from(&appdata).join("npm").join("node.exe");
            if p.exists() {
                return Some(("node".to_string(), p));
            }
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let deno_p = std::path::PathBuf::from(&userprofile).join(".deno").join("bin").join("deno.exe");
            if deno_p.exists() {
                return Some(("deno".to_string(), deno_p));
            }
            let bun_p = std::path::PathBuf::from(&userprofile).join(".bun").join("bin").join("bun.exe");
            if bun_p.exists() {
                return Some(("bun".to_string(), bun_p));
            }
        }
    }

    #[cfg(unix)]
    {
        let unix_candidates = [
            ("deno", "/opt/homebrew/bin/deno"),
            ("deno", "/usr/local/bin/deno"),
            ("node", "/opt/homebrew/bin/node"),
            ("node", "/usr/local/bin/node"),
            ("node", "/usr/bin/node"),
            ("bun", "/opt/homebrew/bin/bun"),
            ("bun", "/usr/local/bin/bun"),
        ];
        for (name, path_str) in unix_candidates {
            let p = std::path::PathBuf::from(path_str);
            if p.exists() {
                return Some((name.to_string(), p));
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            let deno_p = std::path::PathBuf::from(&home).join(".deno").join("bin").join("deno");
            if deno_p.exists() {
                return Some(("deno".to_string(), deno_p));
            }
            let bun_p = std::path::PathBuf::from(&home).join(".bun").join("bin").join("bun");
            if bun_p.exists() {
                return Some(("bun".to_string(), bun_p));
            }
        }
    }

    // 4. Check if available in system PATH
    if let Ok(path_var) = std::env::var("PATH") {
        let separator = if cfg!(windows) { ';' } else { ':' };
        for dir in path_var.split(separator) {
            let dir_buf = std::path::PathBuf::from(dir);
            for (name, exe) in [
                ("deno", deno_name),
                ("node", node_name),
                ("quickjs", qjs_name),
                ("bun", bun_name),
            ] {
                let candidate = dir_buf.join(exe);
                if candidate.exists() {
                    return Some((name.to_string(), candidate));
                }
            }
        }
    }

    None
}

async fn ensure_js_runtime(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Some((_, path)) = find_js_runtime(app) {
        return Ok(path);
    }

    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bin_dir = app_data.join("bin");
    std::fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;

    let (asset_name, dest_name) = if cfg!(windows) {
        ("qjs-windows-x86_64.exe", "qjs.exe")
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            ("qjs-darwin-arm64", "qjs")
        } else {
            ("qjs-darwin-x86_64", "qjs")
        }
    } else {
        ("qjs-linux-x86_64", "qjs")
    };

    let download_url = format!("https://github.com/quickjs-ng/quickjs/releases/download/v0.17.0/{asset_name}");

    let client = reqwest::Client::builder()
        .user_agent("SM-SAVE-RuntimeInstaller")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client
        .get(&download_url)
        .send()
        .await
        .map_err(|e| format!("Failed to download JavaScript runtime: {e}"))?;

    if !res.status().is_success() {
        return Err(format!("JavaScript runtime download failed with status: {}", res.status()));
    }

    let bytes = res.bytes().await.map_err(|e| format!("Failed to read runtime asset bytes: {e}"))?;
    let dest_path = bin_dir.join(dest_name);
    let tmp_path = bin_dir.join(format!("{dest_name}.tmp"));

    std::fs::write(&tmp_path, &bytes).map_err(|e| format!("Failed to write runtime binary: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&tmp_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&tmp_path, perms).map_err(|e| e.to_string())?;
    }

    std::fs::rename(&tmp_path, &dest_path).map_err(|e| format!("Failed to replace runtime binary: {e}"))?;

    Ok(dest_path)
}

fn get_js_runtime_args(app: &tauri::AppHandle) -> Vec<String> {
    let mut runtime_args = Vec::new();

    if let Some((name, path)) = find_js_runtime(app) {
        runtime_args.push("--js-runtimes".to_string());
        runtime_args.push(format!("{}:{}", name, path.to_string_lossy()));
    }

    // Always enable other supported runtimes so yt-dlp checks PATH as well
    runtime_args.push("--js-runtimes".to_string());
    runtime_args.push("node".to_string());
    runtime_args.push("--js-runtimes".to_string());
    runtime_args.push("quickjs".to_string());
    runtime_args.push("--js-runtimes".to_string());
    runtime_args.push("bun".to_string());

    runtime_args
}

fn configure_cmd_env(cmd: &mut std::process::Command, app: &tauri::AppHandle) {
    prevent_cmd_window(cmd);
    let mut extra_dirs = Vec::new();

    // 1. Add app_data_dir/bin (where dynamic yt-dlp and qjs live)
    if let Ok(app_data) = app.path().app_data_dir() {
        let bin_dir = app_data.join("bin");
        if bin_dir.exists() {
            extra_dirs.push(bin_dir);
        }
    }

    // 2. Add exe_dir
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            extra_dirs.push(exe_dir.to_path_buf());
        }
    }

    // 3. Add well-known dirs on Windows
    #[cfg(windows)]
    {
        let win_dirs = [
            r"C:\Program Files\nodejs",
            r"C:\Program Files (x86)\nodejs",
        ];
        for d in win_dirs {
            let p = std::path::PathBuf::from(d);
            if p.exists() {
                extra_dirs.push(p);
            }
        }
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            let deno_dir = std::path::PathBuf::from(&userprofile).join(".deno").join("bin");
            if deno_dir.exists() {
                extra_dirs.push(deno_dir);
            }
        }
    }

    if !extra_dirs.is_empty() {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let separator = if cfg!(windows) { ";" } else { ":" };
        let mut new_path_parts = Vec::new();
        for dir in extra_dirs {
            new_path_parts.push(dir.to_string_lossy().to_string());
        }
        if !current_path.is_empty() {
            new_path_parts.push(current_path);
        }
        cmd.env("PATH", new_path_parts.join(separator));
    }
}

#[tauri::command]
async fn setup_js_runtime(app: tauri::AppHandle) -> Result<String, String> {
    let path = ensure_js_runtime(&app).await?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
pub struct YtDlpOutput {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
async fn run_ytdlp_dump(app: tauri::AppHandle, args: Vec<String>) -> Result<YtDlpOutput, String> {
    if find_js_runtime(&app).is_none() {
        let _ = ensure_js_runtime(&app).await;
    }

    let ytdlp_path = resolve_active_ytdlp_path(&app)?;
    let runtime_args = get_js_runtime_args(&app);
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = std::process::Command::new(ytdlp_path);
        configure_cmd_env(&mut cmd, &app_handle);
        cmd.args(runtime_args)
            .args(args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            cmd.process_group(0);
        }

        let child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {e}"))?;
        let pid = child.id();

        if let Ok(mut active) = ACTIVE_DOWNLOAD_PIDS.lock() {
            active.push(pid);
        }

        let output = child.wait_with_output();

        if let Ok(mut active) = ACTIVE_DOWNLOAD_PIDS.lock() {
            active.retain(|&p| p != pid);
        }

        let output = output.map_err(|e| format!("Execution failed: {e}"))?;

        Ok(YtDlpOutput {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            code: output.status.code().unwrap_or(-1),
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn spawn_ytdlp_download(
    app: tauri::AppHandle,
    args: Vec<String>,
    event_channel: String,
) -> Result<u32, String> {
    let ytdlp_path = resolve_active_ytdlp_path(&app)?;
    let runtime_args = get_js_runtime_args(&app);

    let mut cmd = std::process::Command::new(ytdlp_path);
    configure_cmd_env(&mut cmd, &app);
    cmd.args(runtime_args)
        .args(args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        // Make the child the leader of its own process group (PGID == PID).
        // Any child processes it spawns (e.g. ffmpeg) belong to this group,
        // allowing all of them to be killed with a single signal to the process group.
        cmd.process_group(0);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn process: {e}"))?;
    let pid = child.id();

    if let Ok(mut active) = ACTIVE_DOWNLOAD_PIDS.lock() {
        active.push(pid);
    }

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone1 = app.clone();
    let channel1 = event_channel.clone();
    if let Some(stdout) = stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_clone1.emit(&format!("{channel1}:stdout"), line);
            }
        });
    }

    let app_clone2 = app.clone();
    let channel2 = event_channel.clone();
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                let _ = app_clone2.emit(&format!("{channel2}:stderr"), line);
            }
        });
    }

    let app_clone3 = app;
    let channel3 = event_channel;
    std::thread::spawn(move || {
        let status = child.wait();
        if let Ok(mut active) = ACTIVE_DOWNLOAD_PIDS.lock() {
            active.retain(|&p| p != pid);
        }
        let code = status.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);
        let _ = app_clone3.emit(&format!("{channel3}:close"), code);
    });

    Ok(pid)
}

#[derive(serde::Serialize)]
pub struct FileStatus {
    pub exists: bool,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub resolved_path: Option<String>,
}

fn get_system_download_dir(app: &tauri::AppHandle) -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            let p = std::path::PathBuf::from(user_profile).join("Downloads");
            if p.exists() {
                return p;
            }
        }
    }
    app.path().download_dir().unwrap_or_else(|_| {
        #[cfg(target_os = "windows")]
        {
            if let Ok(user_profile) = std::env::var("USERPROFILE") {
                return std::path::PathBuf::from(user_profile).join("Downloads");
            }
        }
        std::path::PathBuf::from(".")
    })
}

fn resolve_existing_variant(path: &std::path::Path) -> Option<std::path::PathBuf> {
    if path.exists() {
        return Some(path.to_path_buf());
    }

    let parent = path.parent()?;
    let stem = path.file_stem()?.to_str()?;

    let mut clean_stem = stem
        .trim_end_matches(".part")
        .trim_end_matches(".ytdl");

    if let Some(idx) = clean_stem.rfind('.') {
        let suffix = &clean_stem[idx + 1..];
        if suffix.chars().all(|c| c.is_ascii_digit())
            || (suffix.starts_with('f') && suffix[1..].chars().all(|c| c.is_ascii_digit()))
        {
            clean_stem = &clean_stem[..idx];
        }
    }

    let candidates = [
        "mp4", "mp3", "m4a", "webm", "mkv", "wav", "flac", "opus", "aac",
    ];

    for ext in &candidates {
        let candidate = parent.join(format!("{clean_stem}.{ext}"));
        if candidate.exists() {
            return Some(candidate);
        }
    }

    None
}

#[tauri::command]
fn get_download_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = get_system_download_dir(&app);
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn check_file_status(app: tauri::AppHandle, path: String) -> FileStatus {
    let clean = path.trim().trim_end_matches(['/', '\\']);
    let mut p = std::path::PathBuf::from(clean);
    if !p.is_absolute() {
        p = get_system_download_dir(&app).join(&p);
    }

    let (exists, final_path) = if p.exists() {
        (true, p.clone())
    } else if let Some(resolved) = resolve_existing_variant(&p) {
        (true, resolved)
    } else {
        (false, p.clone())
    };

    if exists {
        if final_path.is_dir() {
            FileStatus {
                exists: true,
                is_dir: true,
                size: None,
                resolved_path: if final_path != std::path::Path::new(clean) {
                    Some(final_path.to_string_lossy().to_string())
                } else {
                    None
                },
            }
        } else {
            let size = std::fs::metadata(&final_path).map(|m| m.len()).ok();
            FileStatus {
                exists: true,
                is_dir: false,
                size,
                resolved_path: if final_path != std::path::Path::new(clean) {
                    Some(final_path.to_string_lossy().to_string())
                } else {
                    None
                },
            }
        }
    } else {
        FileStatus {
            exists: false,
            is_dir: false,
            size: None,
            resolved_path: None,
        }
    }
}

#[tauri::command]
fn reveal_in_folder(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let clean_path = path.trim().trim_end_matches(['/', '\\']);
    let mut p = std::path::PathBuf::from(clean_path);
    if !p.is_absolute() {
        p = get_system_download_dir(&app).join(&p);
    }

    if !p.exists() {
        if let Some(resolved) = resolve_existing_variant(&p) {
            p = resolved;
        } else {
            return Err("File or folder does not exist on disk".into());
        }
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&p)
            .spawn()
            .map_err(|e| format!("Failed to reveal in Finder: {e}"))?;
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer");
        prevent_cmd_window(&mut cmd);
        if p.is_dir() {
            cmd.arg(&p);
        } else {
            // Windows Explorer requires /select,<path> as a single argument without spaces
            cmd.arg(format!("/select,{}", p.display()));
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to reveal in Explorer: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        let target = if p.is_dir() { &p } else { p.parent().unwrap_or(&p) };
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
fn open_download_folder(app: tauri::AppHandle, path: Option<String>) -> Result<(), String> {
    let target_dir = if let Some(custom_path) = path.filter(|s| !s.trim().is_empty()) {
        let clean = custom_path.trim().trim_end_matches(['/', '\\']);
        let p = std::path::PathBuf::from(clean);
        if p.exists() {
            if p.is_dir() {
                p
            } else {
                p.parent().map(|parent| parent.to_path_buf()).unwrap_or(p)
            }
        } else {
            get_system_download_dir(&app)
        }
    } else {
        get_system_download_dir(&app)
    };

    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("explorer");
        prevent_cmd_window(&mut cmd);
        // Do NOT use canonicalize on Windows as it adds \\?\ prefix which explorer.exe rejects
        cmd.arg(&target_dir);
        cmd.spawn().map_err(|e| format!("Failed to open Explorer: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("Failed to open in Finder: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
fn delete_file_from_disk(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(());
    }

    let canonical_p = match std::fs::canonicalize(p) {
        Ok(c) => c,
        Err(_) => p.to_path_buf(),
    };

    // 1. Critical directory blacklists
    let download_dir = Some(get_system_download_dir(&app));
    let home_dir = app.path().home_dir().ok();
    let desktop_dir = app.path().desktop_dir().ok();
    let document_dir = app.path().document_dir().ok();

    let forbidden_candidates = vec![
        Some(std::path::PathBuf::from("/")),
        download_dir.clone(),
        home_dir,
        desktop_dir,
        document_dir,
    ];

    for forbidden in forbidden_candidates.into_iter().flatten() {
        if let Ok(canon_forbidden) = std::fs::canonicalize(&forbidden) {
            if canonical_p == canon_forbidden {
                return Err(format!(
                    "Critical safety refusal: cannot delete system or user directory: {}",
                    canon_forbidden.display()
                ));
            }
        }
    }

    // 2. Directory safety: directories may ONLY be removed if they are a legitimate child inside Downloads
    if p.is_dir() {
        if let Some(dl_dir) = download_dir {
            let canon_dl = std::fs::canonicalize(&dl_dir).unwrap_or(dl_dir);
            // Must be strictly inside Downloads and NOT Downloads itself
            if !canonical_p.starts_with(&canon_dl) || canonical_p == canon_dl {
                return Err("Safety refusal: only sub-directories inside the Downloads folder can be deleted".into());
            }

            // Ensure the directory name is not "Downloads", "", etc.
            let dir_name = canonical_p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if dir_name.is_empty() || dir_name.eq_ignore_ascii_case("downloads") {
                return Err("Safety refusal: cannot delete folder named Downloads".into());
            }

            std::fs::remove_dir_all(&canonical_p)
                .map_err(|e| format!("Failed to remove directory: {e}"))?;
        } else {
            return Err("Safety refusal: cannot resolve Downloads directory".into());
        }
    } else {
        // Single file deletion: ensure it's a file, not a directory
        std::fs::remove_file(&canonical_p)
            .map_err(|e| format!("Failed to delete file: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
fn delete_empty_dir_if_exists(app: tauri::AppHandle, path: String) -> Result<bool, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Ok(false);
    }

    let canonical_p = match std::fs::canonicalize(p) {
        Ok(c) => c,
        Err(_) => p.to_path_buf(),
    };

    let download_dir = Some(get_system_download_dir(&app));
    if let Some(dl_dir) = download_dir {
        let canon_dl = std::fs::canonicalize(&dl_dir).unwrap_or(dl_dir);
        if !canonical_p.starts_with(&canon_dl) || canonical_p == canon_dl {
            return Err("Safety refusal: only sub-directories inside Downloads can be deleted".into());
        }

        let dir_name = canonical_p.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if dir_name.is_empty() || dir_name.eq_ignore_ascii_case("downloads") {
            return Err("Safety refusal: cannot delete Downloads directory".into());
        }

        if let Ok(entries) = std::fs::read_dir(&canonical_p) {
            let mut non_ignorable_count = 0;
            let mut ds_store_path = None;
            for entry in entries.flatten() {
                let name = entry.file_name();
                if name == ".DS_Store" {
                    ds_store_path = Some(entry.path());
                } else {
                    non_ignorable_count += 1;
                }
            }

            if non_ignorable_count == 0 {
                if let Some(ds) = ds_store_path {
                    let _ = std::fs::remove_file(ds);
                }
                std::fs::remove_dir(&canonical_p)
                    .map_err(|e| format!("Failed to remove empty directory: {e}"))?;
                return Ok(true);
            }
        }
    }
    Ok(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if find_js_runtime(&handle).is_none() {
                    let _ = ensure_js_runtime(&handle).await;
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            kill_process,
            get_exe_dir,
            get_download_dir,
            check_ytdlp_update,
            install_ytdlp_update,
            setup_js_runtime,
            run_ytdlp_dump,
            spawn_ytdlp_download,
            check_file_status,
            reveal_in_folder,
            open_download_folder,
            delete_file_from_disk,
            delete_empty_dir_if_exists
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


