# Local Embedding Model Setup & Management

## 1. Directory Convention
The application scans the user-facing folder:
`%USERPROFILE%\Documents\ComfyPanelStudio\models\`

Example file:
`C:\Users\<username>\Documents\ComfyPanelStudio\models\nomic-embed-text-v1.5.Q8_0.gguf`

The application will create this folder automatically if it does not exist, and provides an "Open Model Folder" action in the UI.

## 2. Server Management
- The Python backend manages an instance of `llama-server.exe` in `--embedding` mode.
- Bind IP: strictly `127.0.0.1` (never `0.0.0.0`).
- Port: dynamically allocated or configured (default: 8089).
- Arguments:
  `llama-server.exe -m "<path-to-model.gguf>" --embedding --port <port> --host 127.0.0.1 --ctx-size 2048`

## 3. Validation Workflow
1. File check: exists and has `.gguf` extension.
2. Launch subprocess with timeout.
3. Health check: polling `http://127.0.0.1:<port>/health` until ready.
4. Test inference: send `POST /v1/embeddings` or `POST /embedding` with `{"content": "health test"}`.
5. Verify response vector: non-empty, finite floats, record dimension.
6. Record model fingerprint (filename, size, mtime).

## 4. Mock Embedding Provider for Automated Tests
In automated headless test environments where GGUF binaries and GPU runtimes are unavailable, a deterministic synthetic embedding provider generates normalized 384-dimensional or 768-dimensional float32 vectors based on text hashing. This allows 100% of the vector storage, SQLite BLOB retrieval, cosine similarity calculations, and hybrid search ranking logic to be thoroughly verified.
