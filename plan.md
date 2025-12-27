# Architecture & Implementation Documentation: Vivid

## 1. Project Overview
**Vivid** is a secure, real-time, peer-to-peer (P2P) video calling application designed for 1-on-1 sessions. It emphasizes security, ease of use, and a modern user experience with features like screen sharing, audio mixing, picture-in-picture, and session-based chat.

## 2. System Architecture

### 2.1 Backend (Python / FastAPI)
The backend acts primarily as a **Signaling Server** and **Authentication Provider**. It does *not* process media streams.

*   **Entry Point**: `main.py`
    *   Initializes the `FastAPI` app.
    *   Configures CORS middleware.
    *   Mounts the `static/` directory for frontend assets.
    *   Includes API routes.
*   **Modules (`src/`)**:
    *   **`src/api/routes.py`**:
        *   `POST /api/join`: Handles authentication. Validates room ID and password. Returns a JWT.
        *   `GET /api/ice-config`: Dynamic ICE server configuration (STUN/TURN), supporting Metered.ca or manual config.
        *   `WS /ws/{room_id}`: The WebSocket signaling channel. Requires a valid JWT query parameter. Enforces a **2-person limit** per room.
    *   **`src/services/room_manager.py`**:
        *   Manages the state of active rooms in-memory (`rooms` dict).
        *   Uses `asynccontextmanager` to handle the WebSocket connection lifecycle (auto-cleanup on disconnect).
        *   Broadcasts signaling messages (SDP, ICE, User Left, Chat) to the *other* peer in the room.
    *   **`src/auth/security.py`**:
        *   **JWT**: Generates signed tokens with `python-jose`. Default expiry is 30 minutes.
        *   **Hashing**: Uses `bcrypt` to securely hash room passwords.
    *   **`src/core/config.py`**:
        *   Manages environment variables (`SECRET_KEY`, `TURN_URL`, `TURN_API_KEY`, etc.).

### 2.2 Frontend (Vanilla JS / WebRTC)
The frontend handles all media capture, P2P connection logic, and UI state.

*   **Files**:
    *   `static/index.html`: The structure (Login Form, Video Containers, Chat Sidebar, Toast, Controls). Uses Tailwind CSS.
    *   `static/script.js`: The core logic engine.
    *   `static/style.css`: Custom styles for animations, scrollbars, and window management.
    *   `static/logger.js`: Custom logging utility.

*   **Key Logic Flows**:
    *   **Signaling**: Connects to `/ws/{room_id}`. Listens for `announce`, `offer`, `answer`, `ice-candidate`, `mic-status`, `screen-share-status`, `user-left`, and `chat`.
    *   **WebRTC Negotiation**:
        *   Uses basic signaling. The first user to join (or receive an announce) acts as the offerer.
    *   **ICE Handling**: Queues ICE candidates if the remote description hasn't been set yet.
    *   **Screen Sharing**:
        *   **Dual Stream Architecture**: Adds a *second* video track (`addTrack`) instead of replacing the camera track.
        *   **Audio Mixing**: Uses `AudioContext` to mix Microphone + System Audio.
        *   **UI Layout**: 
            *   **Screen Active**: Screen share takes the Main View. Remote user's camera moves to the Picture-in-Picture overlay.
            *   **Screen Inactive**: Remote user's camera returns to the Main View.
    *   **Video Window Management**:
        *   **Self-View**: Initially hidden when the user is alone. Appears as a Picture-in-Picture (PIP) only when a remote user joins.
        *   **Picture-in-Picture (PIP)**:
            *   **Resizable**: Both local and remote PIP windows are resizable (via CSS `resize: both`).
            *   **Draggable**: Windows can be dragged around the screen (drag logic excludes resize handle).
            *   **Minimizable**: Windows have a header (visible on hover) with a "Minimize" button. Minimizing shrinks the window to a small icon; clicking it restores the view.
            *   **Auto-Reset**: Windows reset to default state/position when session ends.

## 3. Data Flow

### 3.1 Authentication
1.  User enters Room ID + Password.
2.  `POST /api/join` -> Backend checks room existence/limits.
3.  Frontend receives `access_token`.

### 3.2 Connection (Signaling)
1.  Frontend connects to `wss://.../ws/{room_id}?token={jwt}`.
2.  Backend validates JWT.
3.  **New User** sends `announce`.
4.  **Existing User** receives `announce`, creates `Offer`.
5.  **New User** receives `Offer`, sends `Answer`.
6.  **P2P Established**: Media flows directly.

### 3.3 User Disconnection
*   **Detection**: Backend detects `WebSocketDisconnect`.
*   **Broadcast**: Server sends `{"type": "user-left"}`.
*   **Frontend Action**:
    *   Closes `RTCPeerConnection`.
    *   Resets UI to "Waiting" state (Local PIP hidden, Chat cleared, Main view mirrors local cam).
    *   Displays Toast.

## 4. Security Model

*   **Transport Security**: HTTPS/WSS required.
*   **Access Control**: Room Passwords + 2-Person Limit.
*   **Data Privacy**: End-to-End Encryption (WebRTC). Ephemeral Rooms (In-Memory). Chat history is not stored on server.

## 5. Deployment & Configuration

*   **Platform**: Render (Python Web Service).
*   **Build Command**: `pip install -r requirements.txt` (or using `uv`).
*   **Start Command**: `gunicorn -c gunicorn_conf.py main:app`
*   **Environment Variables**: `SECRET_KEY`, `TURN_URL`, `TURN_API_KEY`, `TURN_USERNAME`, `TURN_PASSWORD`, `ENVIRONMENT`.

## 6. Known Limitations
*   **Persistence**: Room passwords lost on restart.
*   **Firefox/Zen Browser**: System audio sharing limitation on Windows.
*   **Mobile Screen Share**: Browser restrictions apply.

## 7. New Feature: Session Chat

### 7.1 Overview
A real-time text chat feature residing in a toggleable sidebar on the right side.

### 7.2 Requirements & Implementation
*   **Toggleable UI**: Can be hidden/shown via a button in the controls bar. Includes an unread message badge.
*   **Fullscreen Support**: Chat Sidebar is moved inside the `#video-screen` container to remain accessible in Fullscreen mode.
*   **Session Persistence Only**: Messages exist only in browser memory.
*   **Auto-Clear**: Chat history clears on session end/user left.
*   **System Integration**: Toast notifications (e.g., "User joined") are mirrored as system messages in the chat log.
*   **Z-Index**: Chat floats above video and controls (`z-index: 110`).
