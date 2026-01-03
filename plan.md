# Architecture & Implementation Documentation: Vivid

## 1. Project Overview
**Vivid** is a secure, real-time, peer-to-peer (P2P) video calling application designed for 1-on-1 sessions. It emphasizes security, ease of use, and a modern user experience.

**Current Status**: Successfully migrated to a standalone Desktop Application (Electron) with a split architecture. The backend is hosted remotely (Render/ngrok), and the desktop client runs a local frontend that connects to it.

---

## 2. System Architecture (Current)

### 2.1 Hybrid Desktop Architecture
*   **Frontend (Electron)**:
    *   **Core**: Electron (Node.js + Chromium).
    *   **Native Features**:
        *   **Custom Title Bar**: Frameless window with custom controls.
        *   **Auto Picture-in-Picture**: Automatically enters PIP mode when switching apps or minimizing, ensuring the remote peer is always visible.
        *   **Custom Screen Selector**: Native source picker with thumbnails, FPS toggles, and **Direct Audio Device Selection**.
        *   **Audio Isolation**: Supports **Virtual Audio Cable (VB-Cable)** routing. By selecting the virtual "Cable Output" as the audio source, the app captures isolated application audio without looping back the remote user's voice.
        *   **Robust Reconnection**: Automatically retries connection 5 times (10s intervals) upon network failure.
    *   **Web Fallback**: Standard `getDisplayMedia` support for screen sharing when running in a standard browser.
*   **Backend (Remote)**:
    *   **Technology**: Python (FastAPI).
    *   **Role**: Signaling server and JWT authentication provider.
    *   **Stability**: Robust exception handling to prevent "Zombie Users" and cascading broadcast failures.

### 2.2 Key Implementation Details
*   **Zero-Native Audio**: The application has been simplified to remove complex C++ dependencies (`naudiodon`). It now leverages standard WebRTC `getUserMedia` with device IDs to capture virtual audio streams directly in the frontend.
*   **Signaling**: Uses a debounced, state-aware signaling protocol to prevent "glare" (offer collisions) and ensure stable peer connections.
*   **PIP Management**: Monitors app focus and user interactions to trigger PIP transitions dynamically.
*   **Name Synchronization**: A two-way `announce` and `welcome` handshake ensures participant names are correctly displayed in both main and overlay views.
*   **Session Continuity**: 
    *   **Token Validity**: Access tokens are valid for **24 hours**, ensuring long sessions are not interrupted by expiration.
    *   **Disconnect Safety**: Server logic ensures a user is cleanly removed even during race conditions (e.g., leaving while another user joins).

---

## 3. Known Issues & Platform Limitations
*   **Audio Loopback (Windows)**: On Windows, standard "System Audio" capture includes the entire system mix. **Vivid solves this via VB-Cable integration**. By routing specific apps to a virtual cable and selecting that cable in Vivid, loopback is eliminated.
*   **PIP Permissions**: Due to browser security, auto-entering PIP sometimes requires a fresh user interaction if the previous PIP window was closed manually.

---

## 4. Development Workflow
*   **Local Dev**: `npm start` (Electron) + `uv run main.py` (Backend).
*   **Remote Testing**: Use `ngrok` for the backend and update `REMOTE_SERVER_URL` in `electron/main.js`.