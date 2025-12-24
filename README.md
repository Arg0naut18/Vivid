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
# Install dependencies
uv sync
# OR
pip install -r requirements.txt
```

### 3. Running Locally
```bash
# Set a secret key for JWT (Optional for local dev)
# Windows: set SECRET_KEY=your_secret
# Linux/macOS: export SECRET_KEY=your_secret

python main.py
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

## 🛠 Tech Stack

- **Backend**: FastAPI, WebSockets, Python-Jose (JWT), Bcrypt.
- **Frontend**: Vanilla JavaScript (ES6+), WebRTC API, Web Audio API, Tailwind CSS.
- **Infrastructure**: Designed for easy deployment on Render, Fly.io, or any VPS.

## 🔒 Security
- **JWT**: Ensures only authorized users can join specific rooms.
- **Bcrypt**: Securely hashes room passwords.
- **HTTPS**: Required for camera/microphone access in production.
```
