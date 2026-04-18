use tauri::{AppHandle, Manager, State, Window, WebviewWindowBuilder, WebviewUrl, Emitter};
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{PathBuf};
use std::fs;

#[tauri::command]
async fn is_meeting_active(app: AppHandle) -> bool {
    app.get_webview_window("meeting").is_some()
}

#[derive(Default)]
struct AppState {
    stored_auth_data: Mutex<Option<serde_json::Value>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingPayload {
    route_path: Option<String>,
    query_string: Option<String>,
}

#[tauri::command]
async fn set_auth_data(state: State<'_, AppState>, auth_data: serde_json::Value) -> Result<(), String> {
    let mut stored = state.stored_auth_data.lock().unwrap();
    *stored = Some(auth_data);
    Ok(())
}

#[tauri::command]
async fn get_auth_data(state: State<'_, AppState>) -> Result<Option<serde_json::Value>, String> {
    let stored = state.stored_auth_data.lock().unwrap();
    Ok(stored.clone())
}

#[tauri::command]
async fn show_recording_controls(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("recording-controls") {
        win.show().unwrap();
        return Ok(());
    }

    let _win = WebviewWindowBuilder::new(&app, "recording-controls", WebviewUrl::App("assets/desktop/recording-controls.html".into()))
        .title("OIS Meet — Recording Controls")
        .inner_size(360.0, 56.0)
        .decorations(false)
        .always_on_top(true)
        .resizable(false)
        .transparent(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn open_meeting_window(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("meeting") {
        win.show().unwrap();
        win.set_focus().unwrap();
        return Ok(());
    }

    let (url, label) = if let Ok(meeting_payload) = serde_json::from_value::<MeetingPayload>(payload.clone()) {
        let route = meeting_payload.route_path.unwrap_or_default();
        let query = meeting_payload.query_string.map(|q| format!("?{}", q)).unwrap_or_default();
        let path = format!("/#{}{}", route, query);
        (WebviewUrl::App(PathBuf::from(path)), "meeting")
    } else if let Some(url_str) = payload.as_str() {
        (WebviewUrl::External(url_str.parse().unwrap()), "meeting")
    } else {
        return Err("Invalid payload".into());
    };

    let _win = WebviewWindowBuilder::new(&app, label, url)
        .title("OIS Meet — Meeting")
        .inner_size(1280.0, 800.0)
        .min_inner_size(900.0, 600.0)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn close_meeting_window(app: AppHandle, force: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("meeting") {
        if force {
            win.close().unwrap();
        } else {
            // In Electron, it showed a message box. In Tauri, we can do the same via plugin-dialog.
            // For now, let's just emit an event or close it.
            win.close().unwrap();
        }
    }
    Ok(())
}

#[tauri::command]
async fn save_audio_file(app: AppHandle, buffer: Vec<u8>, default_file_name: Option<String>) -> Result<serde_json::Value, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let docs_path = app.path().document_dir().unwrap_or_default();
    let default_path = docs_path.join(default_file_name.unwrap_or_else(|| "meeting-recording.wav".into()));

    let file_path = app.dialog()
        .file()
        .set_title("Save Meeting Recording")
        .set_file_name(default_path.to_str().unwrap_or_default())
        .add_filter("WAV Audio", &["wav"])
        .blocking_save_file();

    if let Some(path) = file_path {
        let path_str = path.to_string();
        fs::write(path_str.clone(), buffer).map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "success": true, "filePath": path_str }))
    } else {
        Ok(serde_json::json!({ "success": false, "canceled": true }))
    }
}

#[tauri::command]
fn get_recordings_path(app: AppHandle) -> Result<String, String> {
    let docs_path = app.path().document_dir().unwrap_or_default();
    let recordings_path = docs_path.join("OIS-Meet-Recordings");
    if !recordings_path.exists() {
        fs::create_dir_all(&recordings_path).map_err(|e| e.to_string())?;
    }
    Ok(recordings_path.to_str().unwrap_or_default().to_string())
}

#[tauri::command]
async fn transcribe_audio_file(buffer: Vec<u8>, file_name: Option<String>, ai_api_base_url: Option<String>) -> Result<serde_json::Value, String> {
    let base_url = ai_api_base_url.unwrap_or_else(|| "https://ai.nexaois.com:4433".into());
    let url = format!("{}/transcribe", base_url.trim_end_matches('/'));
    
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let part = reqwest::multipart::Part::bytes(buffer)
        .file_name(file_name.unwrap_or_else(|| "audio.wav".into()))
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new().part("file", part);

    let res = client.post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        res.json().await.map_err(|e| e.to_string())
    } else {
        Err(format!("Transcription failed with status: {}", res.status()))
    }
}

#[tauri::command]
async fn generate_mom(meeting_id: String, date: String, mom_template_name: String, transcript_file_path: String, ai_api_base_url: Option<String>) -> Result<serde_json::Value, String> {
    let base_url = ai_api_base_url.unwrap_or_else(|| "https://ai.nexaois.com:4433".into());
    let url = format!("{}/generate-mom", base_url.trim_end_matches('/'));

    let transcript_content = fs::read_to_string(&transcript_file_path).map_err(|e| e.to_string())?;
    
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|e| e.to_string())?;

    let form = reqwest::multipart::Form::new()
        .text("meeting_id", meeting_id)
        .text("date", date)
        .text("mom_template_name", mom_template_name)
        .part("transcript_file", reqwest::multipart::Part::text(transcript_content).file_name("transcript.txt"));

    let res = client.post(url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let payload: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "status": "success", "result": payload }))
    } else {
        Err(format!("MOM generation failed with status: {}", res.status()))
    }
}

#[tauri::command]
async fn show_native_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn win_minimize(window: Window) {
    window.minimize().unwrap();
}

#[tauri::command]
fn win_maximize(window: Window) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}

#[tauri::command]
fn win_close(window: Window) {
    window.close().unwrap();
}

#[tauri::command]
fn win_is_maximized(window: Window) -> bool {
    window.is_maximized().unwrap()
}

#[tauri::command]
async fn save_transcript_text_file(app: AppHandle, content: String, default_file_name: Option<String>) -> Result<serde_json::Value, String> {
    let recordings_path = PathBuf::from(get_recordings_path(app.clone())?);
    let file_name = default_file_name.unwrap_or_else(|| format!("meeting-transcript-{}.txt", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs()));
    let file_path = recordings_path.join(file_name);
    fs::write(file_path.clone(), content).map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "success": true, "filePath": file_path.to_str().unwrap_or_default() }))
}


#[tauri::command]
fn update_recording_controls(app: AppHandle, state: serde_json::Value) {
    if let Some(win) = app.get_webview_window("recording-controls") {
        let _ = win.emit("recording-state-update", state);
    }
}

#[tauri::command]
fn hide_recording_controls(app: AppHandle) {
    if let Some(win) = app.get_webview_window("recording-controls") {
        let _ = win.close();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            set_auth_data,
            get_auth_data,
            show_recording_controls,
            update_recording_controls,
            hide_recording_controls,
            is_meeting_active,
            open_meeting_window,
            close_meeting_window,
            save_audio_file,
            get_recordings_path,
            transcribe_audio_file,
            generate_mom,
            show_native_notification,
            win_minimize,
            win_maximize,
            win_close,
            win_is_maximized,
            save_transcript_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
