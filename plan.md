# Architecture & Implementation Documentation: Vivid

## 1. Project Overview
**Vivid** is a secure, real-time, peer-to-peer (P2P) video calling application designed for 1-on-1 sessions. It emphasizes security, ease of use, and a modern user experience.

**Current Status**: Successfully migrated to a standalone Desktop Application (Electron) with a split architecture. The backend is hosted remotely (Render), and the desktop client runs a local frontend that connects to it.

---

## 2. System Architecture (Current)

### 2.1 Hybrid Desktop Architecture
*   **Frontend (Electron)**:
    *   **Core**: Electron (Node.js + Chromium).
    *   **UI Source**: Loads local files (`static/index.html`, `static/style.css`, `static/script.js`) directly from the user's disk. This ensures instant loading and perfect CSS rendering without CDN delays.
    *   **Styling**: **Tailwind CSS v4** (via NPM). Styles are pre-compiled into `static/style.css`, removing the need for runtime CDN scripts and "production" warnings.
    *   **Native Features**:
        *   **Custom Title Bar**: Frameless window with custom Minimize/Maximize/Close controls.
        *   **Custom Screen Selector**: Uses `desktopCapturer` API to list windows/screens with thumbnails, replacing the standard browser picker.
        *   **Configurable Sharing**: Users can toggle System Audio and set FPS (30/60) before sharing.
*   **Backend (Remote - Render)**:
    *   **Technology**: Python (FastAPI).
    *   **Role**: purely a **Signaling Server** (WebSocket) and **Authentication Provider** (JWT).
    *   **Static Fallback**: Still mounts `static/` to serve a fallback web version for browser users.

### 2.2 Data Flow
1.  **Startup**: Electron launches -> Loads local `index.html`.
2.  **Config**: `preload.js` injects `VIVID_API_URL` (pointing to Render) into the renderer's `window.electronAPI`.
3.  **Connection**:
    *   Frontend `fetch` calls go to `https://vivid-backend.onrender.com/api/...`.
    *   WebSocket connects to `wss://vivid-backend.onrender.com/ws/...`.
4.  **P2P**: Once signaled, media flows directly between peers (WebRTC), bypassing the server.

### 2.3 Key Implementation Details
*   **Screen Sharing**:
    *   **Electron**: Calls `window.electronAPI.getScreenSources()` -> Main Process returns sources -> User selects -> `navigator.mediaDevices.getUserMedia` with `chromeMediaSourceId`.
    *   **Web Fallback**: Uses standard `navigator.mediaDevices.getDisplayMedia`.
*   **Window Management**: IPC messages (`window-control`) handle frameless window operations.

---

## 3. Next Steps & Roadmap

### 3.1 Immediate Tasks (Distribution)
- [ ] **Build Installer**: Run `npm run dist` to generate the `.exe` installer.
- [ ] **Release**: Share the installer via GitHub Releases or a simple download page.
- [ ] **Web Deployment**: Commit and push the generated `static/style.css` to Render to fix the web version's styling.

### 3.2 Enhancements (Planned)
- [ ] **Auto-Updates**: Configure `electron-updater` to pull new versions from GitHub Releases automatically.
- [ ] **Noise Cancellation**: Integrate a native Node.js module (like `krisp` SDK or similar WebRTC enhancements) for superior audio processing.
- [ ] **System Tray**: Add a tray icon to keep the app running in the background or for quick mute toggles.
- [ ] **Global Hotkeys**: Implement system-wide shortcuts (e.g., `Ctrl+Shift+M` to mute) that work even when the app is minimized.

### 3.3 Known Issues / Optimizations
-   **First Load**: The remote backend might spin down on free tiers (Render). The frontend handles connection retries, but a "Waking up server..." spinner would be better UX.
-   **Security**: Ensure `nodeIntegration` remains false. Review `preload.js` to ensure only strictly necessary APIs are exposed.

## 4. Development Workflow

### 4.1 Running Locally
*   **Desktop**: `npm start` (Runs Electron with local frontend + remote backend).
*   **CSS Watch**: `npm run build:css` (Watches for Tailwind changes).

### 4.2 Building for Production
*   **Desktop**: `npm run dist` (Creates `dist/Vivid Setup 1.0.0.exe`).
*   **Web**: `git push` (Deploys Python backend + Static assets to Render).
