// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let handle = app.handle();
      // Spawn python sidecar or local fastapi supervisor if packaged
      tauri::async_runtime::spawn(async move {
        // Here we can spawn the sidecar command if configured
        println!("Fanfic Atlas desktop initialized successfully.");
      });
      Ok(())
    })
    .run(tauri::generate_context())
    .expect("error while running tauri application");
}
