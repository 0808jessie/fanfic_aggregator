use tauri::RunEvent;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::{Arc, Mutex};

pub struct SidecarState {
    pub child: Arc<Mutex<Option<CommandChild>>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar_child: Arc<Mutex<Option<CommandChild>>> = Arc::new(Mutex::new(None));
    let sidecar_child_clone = sidecar_child.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState { child: sidecar_child.clone() })
        .setup(move |app| {
            let handle = app.handle();
            
            // 嘗試啟動 Python sidecar (api-server)
            match handle.shell().sidecar("api-server") {
                Ok(command) => {
                    match command.spawn() {
                        Ok((_rx, child)) => {
                            println!("Python FastAPI sidecar successfully spawned in background.");
                            *sidecar_child_clone.lock().unwrap() = Some(child);
                        }
                        Err(e) => {
                            eprintln!("Failed to spawn FastAPI sidecar process: {}", e);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Sidecar binary not found or configured incorrectly: {}", e);
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |_app_handle, event| {
        if let RunEvent::ExitRequested { .. } = event {
            // 當 App 關閉時，強行殺掉背景 Python sidecar，釋放 Port 8000
            let mut guard = sidecar_child.lock().unwrap();
            if let Some(child) = guard.take() {
                println!("Terminating background FastAPI sidecar...");
                let _ = child.kill();
            }
        }
    });
}
