# Architecture & Implementation Documentation: Vivid

## 1. Project Overview
**Vivid** is a secure, real-time, peer-to-peer (P2P) video calling application designed for 1-on-1 sessions. It emphasizes security, ease of use, and a modern user experience with features like screen sharing, audio mixing, and picture-in-picture.

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
        *   Broadcasts signaling messages (SDP, ICE, User Left) to the *other* peer in the room.
    *   **`src/auth/security.py`**:
        *   **JWT**: Generates signed tokens with `python-jose`. Default expiry is 30 minutes.
        *   **Hashing**: Uses `bcrypt` to securely hash room passwords.
    *   **`src/core/config.py`**:
        *   Manages environment variables (`SECRET_KEY`, `TURN_URL`, `TURN_API_KEY`, etc.).

### 2.2 Frontend (Vanilla JS / WebRTC)
The frontend handles all media capture, P2P connection logic, and UI state.

*   **Files**:
    *   `static/index.html`: The structure (Login Form, Video Containers, Toast, Controls). Uses Tailwind CSS via CDN (Development mode).
    *   `static/script.js`: The core logic engine.
    *   `static/logger.js`: Custom logging utility for styled console output.
*   **Key Logic Flows**:
    *   **Signaling**: Connects to `/ws/{room_id}`. Listens for `announce`, `offer`, `answer`, `ice-candidate`, `mic-status`, `screen-share-status`, and `user-left`.
    *   **WebRTC Negotiation**:
        *   Uses basic signaling. The first user to join (or receive an announce) acts as the offerer.
    *   **ICE Handling**: Queues ICE candidates if the remote description hasn't been set yet to prevent connection failures.
    *   **Screen Sharing**:
        *   **Dual Stream Architecture**: Adds a *second* video track (`addTrack`) instead of replacing the camera track.
        *   **Receiver Logic**: Distinguishes between the primary camera stream and the secondary screen stream in `ontrack` by comparing stream IDs.
        *   **Audio Mixing**: Uses `AudioContext` to mix Microphone + System Audio into a single audio track sent to the peer. This ensures the remote user hears both the presenter's voice and the shared content's audio.
        *   **UI Layout**: 
            *   **Screen Active**: Screen share takes the Main View. Remote user's camera moves to the Picture-in-Picture overlay.
            *   **Screen Inactive**: Remote user's camera returns to the Main View.
    *   **UI/UX**:
        *   **Auto-PiP**: Automatically attempts to pop the remote video into Picture-in-Picture when sharing starts (if supported).
        *   **Draggable Windows**: Supports Mouse and Touch events for moving the PiP window and local preview.
        *   **Responsive**: Adapts layout for Mobile vs. Desktop using Tailwind.

## 3. Data Flow

### 3.1 Authentication
1.  User enters Room ID + Password.
2.  `POST /api/join` -> Backend checks if room exists.
    *   **New Room**: Hashes password, creates room (max 1000 rooms total), issues JWT.
    *   **Existing Room**: Verifies hash, issues JWT.
3.  Frontend receives `access_token`.

### 3.2 Connection (Signaling)
1.  Frontend connects to `wss://.../ws/{room_id}?token={jwt}`.
2.  Backend validates JWT and room availability (max 2 users).
3.  **New User** sends `announce` ("I am here").
4.  **Existing User** receives `announce`:
    *   Creates `Offer` -> Sends to Server -> Server relays to New User.
5.  **New User** receives `Offer`:
    *   Sets Remote Description.
    *   Creates `Answer` -> Sends to Server -> Relayed to Existing User.
6.  **P2P Established**: Media flows directly between browsers.

### 3.3 User Disconnection
*   **Detection**: Backend detects `WebSocketDisconnect`.
*   **Broadcast**: Server sends `{"type": "user-left"}` to the remaining peer.
*   **Frontend Action**:
    *   Closes the `RTCPeerConnection`.
    *   Resets UI to "Waiting" state (Local preview only).
    *   Displays a Toast notification.

## 4. Security Model

*   **Transport Security**:
    *   **HTTPS/WSS**: Mandatory for WebRTC and secure cookie/token handling.
    *   **CSP**: Implemented Content-Security-Policy to mitigate XSS.
    *   **DTLS/SRTP**: All P2P media is end-to-end encrypted.
*   **Access Control**:
    *   **Room Passwords**: Prevents unauthorized joining.
    *   **2-Person Limit**: Hard enforcement in `routes.py`. A 3rd connection attempt is rejected.
*   **Data Privacy**:
    *   **E2EE**: The server **never** sees the video/audio stream.
    *   **Ephemeral Rooms**: Rooms and their state exist only in RAM. Once the session ends and the last user leaves, the room is deleted.

## 5. Deployment & Configuration

*   **Platform**: Render (Python Web Service).
*   **Build Command**: `pip install -r requirements.txt` (or using `uv` for faster builds).
*   **Start Command**: `gunicorn -c gunicorn_conf.py main:app`
*   **Environment Variables**:
    *   `SECRET_KEY`: Used for JWT signing.
    *   `TURN_URL`, `TURN_API_KEY`: For dynamic TURN server integration (e.g., via Metered.ca).
    *   `TURN_USERNAME`, `TURN_PASSWORD`: For static TURN server configuration.
    *   `ENVIRONMENT`: Set to `production` to enable production logging and security settings.

## 6. Known Limitations & Browser Support
*   **Persistence**: Room passwords are lost on server restart (In-Memory DB).
*   **Firefox/Zen Browser**: Does not support system audio sharing via `getDisplayMedia` on Windows. Users are warned via UI toast.
*   **Mobile Screen Share**: Many mobile browsers restrict outgoing screen sharing.
*   **Tailwind CDN**: Currently using the development CDN, which shows a console warning. Recommend switching to a PostCSS build for production.