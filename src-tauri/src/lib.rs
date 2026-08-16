use std::{
  net::{SocketAddr, TcpStream},
  sync::Mutex,
  thread,
  time::Duration,
};
use tauri::{Manager, RunEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};

struct ServerProcess(Mutex<Option<CommandChild>>);

fn log_sidecar_readiness() {
  thread::spawn(|| {
    let address = SocketAddr::from(([127, 0, 0, 1], 8000));
    for attempt in 1..=30 {
      if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok() {
        println!("FastAPI sidecar is listening on http://127.0.0.1:8000 (attempt {attempt}).");
        return;
      }
      thread::sleep(Duration::from_millis(250));
    }
    eprintln!("FastAPI sidecar did not open port 8000 within 7.5 seconds. Review [FastAPI Err] logs for the startup failure.");
  });
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(ServerProcess(Mutex::new(None)))
    .setup(|app| {
      let handle = app.handle();
      println!("Fanfic Atlas setup initialized. Resolving and spawning bundled api-server sidecar...");

      match handle.shell().sidecar("api-server") {
        Ok(command) => {
          match command.spawn() {
            Ok((mut rx, child)) => {
              println!("FastAPI sidecar spawned successfully with PID: {:?}", child.pid());
              if let Some(state) = app.try_state::<ServerProcess>() {
                let mut lock = state.0.lock().unwrap();
                *lock = Some(child);
              }
              log_sidecar_readiness();
              tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                  match event {
                    CommandEvent::Stdout(line) => println!("[FastAPI] {}", String::from_utf8_lossy(&line)),
                    CommandEvent::Stderr(line) => eprintln!("[FastAPI Err] {}", String::from_utf8_lossy(&line)),
                    CommandEvent::Error(error) => eprintln!("[FastAPI Sidecar Error] {error}"),
                    CommandEvent::Terminated(status) => eprintln!(
                      "[FastAPI Sidecar Exit] code={:?}, signal={:?}. The backend will be unavailable until the desktop app is restarted.",
                      status.code,
                      status.signal
                    ),
                    _ => {}
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
