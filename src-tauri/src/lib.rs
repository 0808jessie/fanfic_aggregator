use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

struct ServerProcess(Mutex<Option<CommandChild>>);

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .manage(ServerProcess(Mutex::new(None)))
    .setup(|app| {
      let handle = app.handle();
      println!("Fanfic Atlas lib setup initialized. Spawning Python sidecar...");

      match handle.shell().sidecar("api-server") {
        Ok(command) => {
          match command.spawn() {
            Ok((mut rx, child)) => {
              println!("FastAPI sidecar spawned successfully with PID: {:?}", child.pid());
              if let Some(state) = app.try_state::<ServerProcess>() {
                let mut lock = state.0.lock().unwrap();
                *lock = Some(child);
              }
              tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                  if let tauri_plugin_shell::process::CommandEvent::Stdout(line) = event {
                    println!("[FastAPI] {}", String::from_utf8_lossy(&line));
                  } else if let tauri_plugin_shell::process::CommandEvent::Stderr(line) = event {
                    eprintln!("[FastAPI Err] {}", String::from_utf8_lossy(&line));
                  }
                }
              });
            }
            Err(e) => {
              eprintln!("Failed to spawn FastAPI sidecar process: {}", e);
            }
          }
        }
        Err(e) => {
          eprintln!("Failed to create sidecar command 'api-server': {}", e);
        }
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      if let RunEvent::ExitRequested { .. } = event {
        println!("App exit requested. Terminating FastAPI sidecar...");
        if let Some(state) = app_handle.try_state::<ServerProcess>() {
          let mut lock = state.0.lock().unwrap();
          if let Some(child) = lock.take() {
            let _ = child.kill();
            println!("FastAPI sidecar terminated.");
          }
        }
      }
    });
}
