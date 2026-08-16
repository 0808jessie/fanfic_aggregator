pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      let _handle = app.handle();
      println!("Fanfic Atlas lib setup initialized.");
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
