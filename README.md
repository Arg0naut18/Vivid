# Vivid

Vivid is a secure, real-time video calling application built with **FastAPI** and **WebRTC**. It supports high-quality 1-on-1 sessions with integrated screen sharing and advanced audio mixing.

## ✨ Key Features

- **P2P Video & Audio**: Low-latency peer-to-peer communication.
- **Screen Sharing + Audio Mixing**: Share your screen while simultaneously broadcasting your microphone and system audio.
- **Auto Picture-in-Picture (PiP)**: Automatically pops out the remote peer's video into a floating window when you share your screen, so you never lose sight of them.
- **Secure Sessions**: Per-room password protection with JWT-based authentication.
- **Draggable UI**: Custom draggable video overlays for a flexible viewing experience.
- **Modern UI**: Clean design using Tailwind CSS and Heroicon SVGs.

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.12+
- [uv](https://github.com/astral-sh/uv) (recommended) or `pip`

### 2. Installation
```bash
# Install dependencies using uv
uv sync
```

### 3. Running Locally (Windows/Linux/Mac)
Use the built-in Uvicorn server for development.

```bash
# Start the development server
uv run main.py
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### 4. Running in Production (Linux/Mac Only)
For production environments (e.g., Render, Fly.io, Ubuntu VPS), use **Gunicorn** with Uvicorn workers for process management.

> **Note:** Gunicorn does not support Windows. Windows users should stick to `uv run main.py`.

```bash
# Start the server using uv
uv run gunicorn -c gunicorn_conf.py main:app
```

## 🛠 Tech Stack

- **Backend**: FastAPI, WebSockets, Python-Jose (JWT), Bcrypt.
- **Frontend**: Vanilla JavaScript (ES6+), WebRTC API, Web Audio API, Tailwind CSS.
- **Infrastructure**: Designed for easy deployment on Render, Fly.io, or any VPS.

## 🔒 Security
- **JWT**: Ensures only authorized users can join specific rooms.
- **Bcrypt**: Securely hashes room passwords.
- **HTTPS**: Required for camera/microphone access in production.
```
