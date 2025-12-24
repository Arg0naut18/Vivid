# Implementation Plan: Vivid - Video Calling Application

## Goal
Create a robust, secure, and user-friendly real-time video calling application for 2 concurrent users per room.

## Key Features (Implemented)
1.  **2-Person Session**: Peer-to-peer audio/video calling.
2.  **Screen Sharing & Audio Mixing**:
    *   **Features**: Seamlessly mix Microphone + System Audio.
    *   **Controls**: "Change Window" support and dedicated "Stop Sharing" button.
    *   **State**: Global state management to properly stop screen capture streams.
3.  **UI/UX**:
    *   **Icons**: Modern SVG icons (Heroicons style) for all controls.
    *   **Indicators**: Visual Red Mute icons (🔇) on video feeds.
    *   **Layout**: Draggable "Self View" and "Remote Overlay".
    *   **Picture-in-Picture (PiP)**: **Auto-PiP** for the remote video when the local user starts sharing, ensuring the remote peer is always visible.
4.  **Security**:
    *   **Auth**: Per-Room Password Authentication (JWT-based).
    *   **Hashing**: `bcrypt` for secure password storage.
    *   **WebSocket**: Secured connection via Token validation.
5.  **Architecture**:
    *   **Backend**: Modular Python (FastAPI) structure (`src/` with `auth`, `api`, `services`).
    *   **Frontend**: Vanilla JS with robust Event Handling and DOM manipulation.

## Current Architecture
*   **Backend**: `src/` modules.
    *   `api/routes.py`: Handles HTTP Auth and WebSocket signaling.
    *   `services/room_manager.py`: Manages room state and connections using `asynccontextmanager`.
    *   `auth/security.py`: JWT generation and `bcrypt` hashing.
*   **Frontend**: `static/` files.
    *   `script.js`: Handles WebRTC (`RTCPeerConnection`), Audio Context (Mixing), and UI Logic.
    *   `index.html`: Tailwind CSS layout with SVG controls.

## Browser Compatibility Notes
*   **WebRTC**: Supported on all modern browsers (Chrome, Firefox, Safari, Edge).
*   **Picture-in-Picture**:
    *   Code includes feature detection (`document.pictureInPictureEnabled`).
    *   **Auto-PiP**: Best-effort. Some browsers (like Firefox or Safari) might block *automatic* PiP without a direct user gesture on the specific video element, though the button click to share screen often confers enough trust. The code gracefully handles rejections (`.catch(...)`).
*   **Audio Mixing**: Uses Web Audio API (`createMediaStreamDestination`), widely supported.

## Future Improvements

### 1. Feature Expansions
*   **Multi-User**: Expand to Mesh or SFU topology for >2 users.
*   **Chat**: Add text messaging side-channel.
*   **Recording**: Add client-side recording of the mixed stream.

### 2. DevOps / Deployment
*   **TURN Server**: Essential for production to bypass strict NATs/Firewalls.
*   **Docker**: Create a `Dockerfile` for containerized deployment.
*   **Database**: Migrate from in-memory `rooms` dict to Redis/Postgres for persistence (if needed).

## Deployment Instructions (Render/VPS)
*   **Command**: `python main.py`
*   **Environment Variables**:
    *   `SECRET_KEY`: (Required) Random string for JWT signing.
    *   `PORT`: (Optional) Defaults to 8000.
*   **HTTPS**: **Required** for `getUserMedia` and `getDisplayMedia`. Render provides this by default.