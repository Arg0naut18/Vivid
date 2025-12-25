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
        *   `WS /ws/{room_id}`: The WebSocket signaling channel. Requires a valid JWT query parameter.
    *   **`src/services/room_manager.py`**:
        *   Manages the state of active rooms in-memory (`rooms` dict).
        *   Uses `asynccontextmanager` to handle the WebSocket connection lifecycle (auto-cleanup on disconnect).
        *   Broadcasts signaling messages (SDP, ICE) to the *other* peer in the room.
    *   **`src/auth/security.py`**:
        *   **JWT**: Generates signed tokens with `python-jose`. Default expiry is 30 minutes.
        *   **Hashing**: Uses `bcrypt` (via `passlib` logic replaced by direct `bcrypt`) to securely hash room passwords.
    *   **`src/core/config.py`**:
        *   Manages environment variables (`SECRET_KEY`).

### 2.2 Frontend (Vanilla JS / WebRTC)
The frontend handles all media capture, P2P connection logic, and UI state.

*   **Files**:
    *   `static/index.html`: The structure (Login Form, Video Containers, Toast, Controls). Uses Tailwind CSS.
    *   `static/script.js`: The core logic engine.
*   **Key Logic Flows**:
    *   **Signaling**: Connects to `/ws/{room_id}`. Listens for `announce`, `offer`, `answer`, `ice-candidate`, `mic-status`.
    *   **WebRTC Negotiation**:
        *   Implements the **"Perfect Negotiation"** pattern (Polite vs. Impolite Peer) to prevent glare/deadlocks.
        *   **Impolite Peer**: The user already in the room (Host).
        *   **Polite Peer**: The user joining (Guest).
    *   **ICE Handling**: Queues ICE candidates if the remote description hasn't been set yet to prevent connection failures ("Black Screen").
    *   **Screen Sharing**:
        *   Uses `getDisplayMedia`.
        *   **Audio Mixing**: Uses the **Web Audio API** (`AudioContext`, `MediaStreamDestination`) to mix the Microphone track and System Audio track into a single stream for the remote peer.
        *   **State**: Explicitly stops tracks on "Stop Share" to clear browser indicators.
    *   **UI/UX**:
        *   **Auto-PiP**: Automatically pops the remote video into Picture-in-Picture when sharing starts.
        *   **Draggable Windows**: Supports Mouse and Touch events for moving the PiP window.
        *   **Responsive**: Adapts layout for Mobile vs. Desktop.

## 3. Data Flow

### 3.1 Authentication
1.  User enters Room ID + Password.
2.  `POST /api/join` -> Backend checks if room exists.
    *   **New Room**: Hashes password, creates room, issues JWT.
    *   **Existing Room**: Verifies hash, issues JWT.
3.  Frontend receives `access_token`.

### 3.2 Connection (Signaling)
1.  Frontend connects to `wss://.../ws/{room_id}?token={jwt}`.
2.  Backend validates JWT. If invalid -> Close (403/1008).
3.  **Guest** (New User) sends `announce` ("I am here").
4.  **Host** (Existing User) receives `announce`:
    *   Sets `isPolite = false`.
    *   Creates `Offer` -> Sends to Server -> Server relays to Guest.
5.  **Guest** receives `Offer`:
    *   Sets `isPolite = true`.
    *   Sets Remote Description.
    *   Creates `Answer` -> Sends to Server -> Relayed to Host.
6.  **P2P Established**: Media flows directly between browsers.

### 3.3 User Disconnection
*   **Detection**: Backend detects `WebSocketDisconnect`.
*   **Broadcast**: Server sends `{"type": "user-left"}` to the remaining peer.
*   **Frontend Action**:
    *   Closes the `RTCPeerConnection`.
    *   Resets UI to "Waiting" state (Single view, muted local video).
    *   Displays a Toast notification.

### 3.4 Cross-Network Connectivity (TURN)
*   **Issue**: P2P fails on different networks due to NAT (Network Address Translation).
*   **Solution**: Dynamic TURN configuration.
*   **Implementation**:
    *   **Backend**: `GET /api/ice-config` endpoint.
    *   **Config**: Uses `TURN_API_KEY` or `TURN_URL` env vars.
    *   **Frontend**: Fetches config before call starts.
    *   **Metered.ca Integration**: Securely proxies API key on backend to fetch fresh credentials.

### 3.5 Media
*   **Normal**: `navigator.mediaDevices.getUserMedia` -> PeerConnection.
*   **Rendering**: 
    *   Remote tracks are handled in `ontrack`.
    *   **Robustness**: Explicitly handles cases where tracks arrive without a stream wrapper by creating a local `MediaStream`.
    *   **Auto-Play**: Enforced `play()` call on track receipt to prevent "frozen" or empty video elements.
*   **Screen Share**: 
    *   `getDisplayMedia` (Video + System Audio).
    *   `AudioContext` mixes Mic + System Audio.
    *   `sender.replaceTrack()` swaps the camera track for the screen track.

## 4. Security Model

*   **Transport Security**:
    *   **HTTPS/WSS**: Mandatory for WebRTC. Enforced by the hosting provider (Render).
    *   **DTLS/SRTP**: All P2P media is end-to-end encrypted by the WebRTC protocol itself.
*   **Access Control**:
    *   **Room Passwords**: Prevents unauthorized joining.
    *   **2-Person Limit**: Hard enforcement in `routes.py`. A 3rd connection attempt is rejected immediately.
*   **Data Privacy**:
    *   The server **never** sees the video/audio stream. It only sees the "handshake" data (SDP).

## 5. Deployment & Configuration

*   **Platform**: Render (Python Web Service).
*   **Build Command**: `pip install -r requirements.txt`
*   **Start Command**: `python main.py`
*   **Environment Variables**:
    *   `SECRET_KEY`: **CRITICAL**. Must be a long, random string. If not set, a default dev key is used (insecure).

## 6. Known Limitations & Future Work
*   **Turn Server**: Currently relies on public STUN servers. Corporate/Mobile networks might block P2P. A TURN server (e.g., Coturn) is needed for 100% reliability.
*   **Persistence**: Room passwords are lost on server restart (In-Memory DB).
*   **iOS Screen Share**: Mobile browsers generally restrict screen sharing *from* the device.

## 7. Change Log (Recent Updates)
*   **User Disconnection**: Implemented `user-left` signal. Frontend now correctly resets the UI and notifies the user when a peer leaves.
*   **Video Reliability**: Fixed "Empty Remote Video" bug. The `ontrack` handler now robustly creates streams if missing and forces the video element to play.
*   **Cross-Network Support**: Added `GET /api/ice-config` endpoint. Implemented dynamic fetching of TURN credentials (Metered.ca or manual) to fix NAT traversal issues on different networks.
*   **Code Cleanup**: Removed verbose debug logging and simplified connection logic.
