use axum::{
    body::Body,
    extract::{Json, Path, Query},
    http::{HeaderMap, HeaderValue, StatusCode},
    response::IntoResponse,
    response::sse::{Event, Sse},
    routing::{get, post},
    Router,
};
use base64::Engine as _;
use regex::Regex;
use serde::Deserialize;
use std::{env, path::PathBuf, time::Duration};
use tokio::{fs, process::Command, time::timeout};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_util::io::ReaderStream;
use uuid::Uuid;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

#[derive(Clone)]
struct AppState {
    skopeo_path: String,
    client: reqwest::Client,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    eprintln!("Starting helmer-api...");
    let skopeo_path = env::var("SKOPEO_PATH").unwrap_or_else(|_| "skopeo".to_string());
    eprintln!("Skopeo path: {}", skopeo_path);
    let client = reqwest::Client::builder()
        .user_agent("helmer-api/0.1")
        .build()?;
    eprintln!("HTTP client created");

    let state = AppState { skopeo_path, client };

    let app = Router::new()
        .route("/api/fetchIndex", get(fetch_index))
        .route("/api/pull", get(pull_image).post(pull_image_post))
        .route("/api/pull/stream", post(pull_image_stream))
        .route("/api/pull/file/:id", get(download_file))
        .route("/health", get(health_check))
        .route("/ready", get(readiness_check))
        // API-prefixed aliases (for Docker healthchecks, etc.)
        .route("/api/health", get(health_check))
        .route("/api/ready", get(readiness_check))
        .with_state(state);

    let port = env::var("PORT").unwrap_or_else(|_| "8080".into()).parse::<u16>()?;
    eprintln!("Parsed port: {}", port);
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    eprintln!("Binding to {}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    eprintln!("listening on http://{}", addr);
    axum::serve(listener, app).await?;
    eprintln!("Server stopped");
    Ok(())
}

#[derive(Deserialize)]
struct FetchIndexParams {
    url: String,
}

async fn fetch_index(
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(params): Query<FetchIndexParams>,
) -> impl IntoResponse {
    // Validate URL: only http/https
    let Ok(mut url) = url::Url::parse(&params.url) else {
        return (StatusCode::BAD_REQUEST, "Invalid URL").into_response();
    };
    match url.scheme() {
        "http" | "https" => {}
        _ => return (StatusCode::BAD_REQUEST, "Invalid scheme").into_response(),
    }
    // Normalize to index.yaml if not present
    let path = url.path().to_string();
    if !path.ends_with("/index.yaml") && !path.ends_with("/index.yml") {
        let mut p = path.trim_end_matches('/').to_string();
        p.push_str("/index.yaml");
        url.set_path(&p);
    }

    let res = state.client.get(url.clone()).send().await;
    let Ok(resp) = res else {
        return (StatusCode::BAD_GATEWAY, "Upstream fetch failed").into_response();
    };
    if !resp.status().is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            format!("Upstream error: {}", resp.status()),
        )
            .into_response();
    }
    let text = resp.text().await.unwrap_or_default();
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    (StatusCode::OK, headers, text).into_response()
}

#[derive(Deserialize)]
struct PullParams {
    r#ref: String,
    #[serde(default = "default_format")]
    format: String,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
}

#[derive(Deserialize)]
struct PullRequestBody {
    r#ref: String,
    #[serde(default = "default_format")]
    format: String,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
}

fn default_format() -> String {
    "docker-archive".to_string()
}

fn valid_ref(s: &str) -> bool {
    // letters, digits, slash, dot, colon, @, underscore, dash
    // same as JS: /^[A-Za-z0-9./:@_\-]+$/
    static PATTERN: once_cell::sync::Lazy<Regex> = once_cell::sync::Lazy::new(|| {
        Regex::new(r"^[A-Za-z0-9./:@_\-]+$").unwrap()
    });
    PATTERN.is_match(s)
}

fn parse_repo_tag(reference: &str) -> (String, String) {
    // Remove transport prefix if any (e.g., docker://)
    let ref_no_transport = reference
        .strip_prefix("docker://")
        .or_else(|| reference.split_once("://").map(|(_, r)| r))
        .unwrap_or(reference)
        .to_string();

    let after_registry = match ref_no_transport.find('/') {
        Some(i) => ref_no_transport[i + 1..].to_string(),
        None => ref_no_transport.clone(),
    };

    if let Some((name_part, _digest)) = after_registry.split_once('@') {
        let repo = name_part.split('/').last().unwrap_or("image").to_string();
        return (repo, "latest".to_string());
    }

    if let Some(i) = after_registry.rfind(':') {
        let name_part = &after_registry[..i];
        let tag = &after_registry[i + 1..];
        let repo = name_part.split('/').last().unwrap_or("image").to_string();
        (repo, if tag.is_empty() { "latest".into() } else { tag.into() })
    } else {
        let repo = after_registry.split('/').last().unwrap_or("image").to_string();
        (repo, "latest".into())
    }
}

fn extract_registry(reference: &str) -> String {
    let ref_no_transport = reference
        .strip_prefix("docker://")
        .or_else(|| reference.split_once("://").map(|(_, r)| r))
        .unwrap_or(reference);

    let first = ref_no_transport
        .split('/')
        .next()
        .unwrap_or("docker.io")
        .trim();

    if first.contains('.') || first.contains(':') || first == "localhost" {
        first.to_string()
    } else {
        "docker.io".to_string()
    }
}

async fn maybe_write_authfile(
    reference: &str,
    username: Option<&str>,
    password: Option<&str>,
) -> std::io::Result<Option<PathBuf>> {
    let Some(username) = username.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };
    let Some(password) = password.map(str::trim).filter(|v| !v.is_empty()) else {
        return Ok(None);
    };

    let registry = extract_registry(reference);
    let auth = base64::engine::general_purpose::STANDARD.encode(format!("{username}:{password}"));

    let mut auths = serde_json::Map::new();
    auths.insert(registry.clone(), serde_json::json!({ "auth": auth.clone() }));
    if registry == "docker.io" {
        auths.insert("https://index.docker.io/v1/".to_string(), serde_json::json!({ "auth": auth }));
    }

    let auth_json = serde_json::json!({ "auths": auths }).to_string();
    let auth_path = std::env::temp_dir().join(format!("skopeo-auth-{}.json", Uuid::new_v4()));
    fs::write(&auth_path, auth_json).await?;

    #[cfg(unix)]
    {
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(&auth_path, perms).await;
    }

    Ok(Some(auth_path))
}

// GET endpoint (backwards compatible, credentials in query params - less secure)
async fn pull_image(
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(params): Query<PullParams>,
) -> impl IntoResponse {
    do_pull_image(
        state,
        params.r#ref,
        params.format,
        params.username,
        params.password,
    )
    .await
}

// POST endpoint with secure credentials in body
async fn pull_image_post(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(body): Json<PullRequestBody>,
) -> impl IntoResponse {
    do_pull_image(
        state,
        body.r#ref,
        body.format,
        body.username,
        body.password,
    )
    .await
}

fn temp_tar_path(id: &str) -> std::path::PathBuf {
    std::env::temp_dir().join(format!("pull-{}.tar", id))
}

fn make_filename(repo: &str, tag: &str, fmt: &str) -> String {
    format!("{}-{}-{}.tar", repo, tag, fmt)
}

// Common implementation for both GET and POST
async fn do_pull_image(
    state: AppState,
    reference: String,
    format: String,
    username: Option<String>,
    password: Option<String>,
) -> axum::response::Response {
    // Validate reference
    if reference.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "Missing ref").into_response();
    }

    if !valid_ref(&reference) {
        return (StatusCode::BAD_REQUEST, "Invalid ref").into_response();
    }

    let fmt = match format.as_str() {
        "docker-archive" | "oci-archive" => format.clone(),
        _ => "docker-archive".to_string(),
    };

    let uid = Uuid::new_v4().to_string();
    let tmp_tar = temp_tar_path(&uid);
    let (repo, tag) = parse_repo_tag(&reference);
    let dest = format!("{}:{}:{}:{}", fmt, tmp_tar.display(), repo, tag);
    let authfile_path = match maybe_write_authfile(
        &reference,
        username.as_deref(),
        password.as_deref(),
    )
    .await
    {
        Ok(path) => path,
        Err(e) => {
            let _ = fs::remove_file(&tmp_tar).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to prepare auth file: {e}"),
            )
                .into_response();
        }
    };

    let mut cmd = Command::new(&state.skopeo_path);
    cmd.arg("copy");

    if let Some(path) = &authfile_path {
        cmd.arg("--src-authfile").arg(path);
    }

    cmd.arg(format!("docker://{}", reference)).arg(&dest);

    let result = timeout(Duration::from_secs(300), cmd.output()).await;
    let output = match result {
        Err(_) => {
            let _ = fs::remove_file(&tmp_tar).await;
            if let Some(path) = &authfile_path {
                let _ = fs::remove_file(path).await;
            }
            return (StatusCode::GATEWAY_TIMEOUT, format!("Timeout while copying image: {}", reference)).into_response();
        }
        Ok(Err(e)) => {
            let _ = fs::remove_file(&tmp_tar).await;
            if let Some(path) = &authfile_path {
                let _ = fs::remove_file(path).await;
            }
            if e.kind() == std::io::ErrorKind::NotFound {
                return (StatusCode::NOT_IMPLEMENTED, "skopeo not found (ENOENT)").into_response();
            }
            return (
                StatusCode::BAD_GATEWAY,
                format!("Failed to spawn skopeo: {}", e),
            )
                .into_response();
        }
        Ok(Ok(out)) => out,
    };
    if let Some(path) = &authfile_path {
        let _ = fs::remove_file(path).await;
    }

    if !output.status.success() {
        let _ = fs::remove_file(&tmp_tar).await;
        let stderr = String::from_utf8_lossy(&output.stderr).to_lowercase();
        if stderr.contains("manifest unknown")
            || stderr.contains("not found")
            || stderr.contains("name unknown")
        {
            return (StatusCode::NOT_FOUND, format!("Image not found: {}", reference)).into_response();
        }
        if stderr.contains("denied")
            || stderr.contains("unauthorized")
            || stderr.contains("authentication required")
        {
            return (StatusCode::FORBIDDEN, format!("Access denied to registry for: {}", reference)).into_response();
        }
        return (
            StatusCode::BAD_GATEWAY,
            format!("skopeo error for {}: {}", reference, String::from_utf8_lossy(&output.stderr)),
        )
            .into_response();
    }

    // Get file size for Content-Length header
    let file_size = match fs::metadata(&tmp_tar).await {
        Ok(meta) => meta.len(),
        Err(e) => {
            let _ = fs::remove_file(&tmp_tar).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to get file metadata: {}", e),
            )
                .into_response();
        }
    };

    // Open file for streaming
    let file = match fs::File::open(&tmp_tar).await {
        Ok(f) => f,
        Err(e) => {
            let _ = fs::remove_file(&tmp_tar).await;
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Failed to open archive: {}", e),
            )
                .into_response();
        }
    };

    // Create a stream from the file reader
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    // Schedule file deletion after a delay to allow streaming to complete
    let tmp_clone = tmp_tar.clone();
    tokio::spawn(async move {
        // Give generous time for streaming to finish before cleanup
        tokio::time::sleep(Duration::from_secs(600)).await;
        let _ = fs::remove_file(&tmp_clone).await;
    });

    // Generate filename
    let filename = make_filename(&repo, &tag, &fmt);

    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        HeaderValue::from_static("application/x-tar"),
    );
    headers.insert(
        axum::http::header::CONTENT_LENGTH,
        HeaderValue::from_str(&file_size.to_string()).unwrap_or(HeaderValue::from_static("0")),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename)).unwrap_or(HeaderValue::from_static("attachment")),
    );
    headers.insert(axum::http::header::CACHE_CONTROL, HeaderValue::from_static("no-store"));

    (StatusCode::OK, headers, body).into_response()
}

async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

async fn readiness_check(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> impl IntoResponse {
    let mut cmd = Command::new(&state.skopeo_path);
    cmd.arg("--version");
    
    match timeout(Duration::from_secs(5), cmd.output()).await {
        Ok(Ok(output)) if output.status.success() => {
            (StatusCode::OK, "Ready")
        },
        _ => {
            (StatusCode::SERVICE_UNAVAILABLE, "skopeo not available")
        }
    }
}

// Streaming pull with progress (SSE-like)
async fn pull_image_stream(
    axum::extract::State(state): axum::extract::State<AppState>,
    Json(body): Json<PullRequestBody>,
) -> Sse<ReceiverStream<Result<Event, std::convert::Infallible>>> {
    let reference = body.r#ref;
    let format = body.format;
    let username = body.username;
    let password = body.password;

    let (tx, rx) = mpsc::channel::<Result<Event, std::convert::Infallible>>(64);
    let last_error: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    tokio::spawn(async move {
        let _ = tx.send(Ok(Event::default().event("start").data("starting"))).await;

        if reference.trim().is_empty() || !valid_ref(&reference) {
            let _ = tx.send(Ok(Event::default().event("error").data("invalid reference"))).await;
            return;
        }

        let fmt = match format.as_str() {
            "docker-archive" | "oci-archive" => format.clone(),
            _ => "docker-archive".to_string(),
        };

        let uid = Uuid::new_v4().to_string();
        let tmp_tar = temp_tar_path(&uid);
        let (repo, tag) = parse_repo_tag(&reference);
        let dest = format!("{}:{}:{}:{}", fmt, tmp_tar.display(), repo, tag);
        let authfile_path = match maybe_write_authfile(
            &reference,
            username.as_deref(),
            password.as_deref(),
        )
        .await
        {
            Ok(path) => path,
            Err(e) => {
                let _ = tx
                    .send(Ok(Event::default().event("error").data(format!(
                        "authfile error: {e}"
                    ))))
                    .await;
                return;
            }
        };

        let mut cmd = Command::new(&state.skopeo_path);
        cmd.arg("copy");

        if let Some(path) = &authfile_path {
            cmd.arg("--src-authfile").arg(path);
            let _ = tx
                .send(Ok(Event::default().event("auth").data("using credentials")))
                .await;
        }

        cmd.arg(format!("docker://{}", reference))
            .arg(&dest)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                if let Some(path) = &authfile_path {
                    let _ = fs::remove_file(path).await;
                }
                let _ = tx.send(Ok(Event::default().event("error").data(format!("spawn error: {e}")))).await;
                return;
            }
        };

        if let Some(stdout) = child.stdout.take() {
            let tx_out = tx.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx_out.send(Ok(Event::default().event("progress").data(line))).await;
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let tx_err = tx.clone();
            let last_err = last_error.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    {
                        let mut guard = last_err.lock().await;
                        *guard = Some(line.clone());
                    }
                    let _ = tx_err.send(Ok(Event::default().event("progress").data(line))).await;
                }
            });
        }

        let status = match child.wait().await {
            Ok(s) => s,
            Err(e) => {
                if let Some(path) = &authfile_path {
                    let _ = fs::remove_file(path).await;
                }
                let _ = tx.send(Ok(Event::default().event("error").data(format!("wait error: {e}")))).await;
                return;
            }
        };
        if let Some(path) = &authfile_path {
            let _ = fs::remove_file(path).await;
        }

        if !status.success() {
            // Try to read stderr for better message
            let msg = if let Some(err) = last_error.lock().await.clone() {
                err
            } else {
                "skopeo failed".to_string()
            };
            let _ = tx.send(Ok(Event::default().event("error").data(msg))).await;
            let _ = fs::remove_file(&tmp_tar).await;
            return;
        }

        let filename = make_filename(&repo, &tag, &fmt);
        // Inform client archive ready with download id+filename
        let ready_payload = serde_json::json!({
            "id": uid,
            "filename": filename,
        })
        .to_string();
        let _ = tx.send(Ok(Event::default().event("ready").data(ready_payload))).await;

        // keep file for download; schedule cleanup in 10 minutes
        let path_clone = tmp_tar.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(600)).await;
            let _ = fs::remove_file(&path_clone).await;
        });

        let _ = tx.send(Ok(Event::default().event("end").data("done"))).await;
    });

    Sse::new(ReceiverStream::new(rx))
        .keep_alive(axum::response::sse::KeepAlive::new().interval(Duration::from_secs(15)))
}

async fn download_file(Path(id): Path<String>) -> impl IntoResponse {
    if id.contains('/') || id.contains("..") {
        return (StatusCode::BAD_REQUEST, "invalid id").into_response();
    }
    let path = temp_tar_path(&id);
    if !path.exists() {
        return (StatusCode::NOT_FOUND, "file not found").into_response();
    }

    let meta = match fs::metadata(&path).await {
        Ok(m) => m,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("metadata error: {e}")).into_response(),
    };

    let file = match fs::File::open(&path).await {
        Ok(f) => f,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, format!("open error: {e}")).into_response(),
    };

    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    // delete after serve
    let path_clone = path.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(2)).await;
        let _ = fs::remove_file(&path_clone).await;
    });

    let filename = path.file_name().and_then(|s| s.to_str()).unwrap_or("archive.tar");
    let mut headers = HeaderMap::new();
    headers.insert(axum::http::header::CONTENT_TYPE, HeaderValue::from_static("application/x-tar"));
    headers.insert(axum::http::header::CONTENT_LENGTH, HeaderValue::from_str(&meta.len().to_string()).unwrap_or(HeaderValue::from_static("0")));
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        HeaderValue::from_str(&format!("attachment; filename=\"{}\"", filename)).unwrap_or(HeaderValue::from_static("attachment")),
    );
    headers.insert(axum::http::header::CACHE_CONTROL, HeaderValue::from_static("no-store"));

    (StatusCode::OK, headers, body).into_response()
}
