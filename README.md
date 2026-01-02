# Vivid

Vivid is a secure, real-time video calling application built with **Electron**, **FastAPI** and **WebRTC**. It supports high-quality 1-on-1 sessions with integrated screen sharing and advanced audio mixing.

## ✨ Key Features

- **P2P Video & Audio**: Low-latency peer-to-peer communication.
- **Screen Sharing + Audio Mixing**: Share your screen while simultaneously broadcasting your microphone and system audio.
- **Smart Picture-in-Picture (PiP)**: 
  - Automatically pops out the remote peer's video when you switch to another application or minimize the window.
- **Native Experience**: Custom frameless window design, native screen source picker, and optimized audio constraints for isolation.
- **Secure Sessions**: Per-room password protection with JWT-based authentication.
- **Dynamic UI**: Participant names are synced across all views (Main, Overlay, and PIP).

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (for the Desktop App)
- **Python 3.12+** (for the Backend/Signaling Server)

### 2. Running the Desktop App

```bash
# Install dependencies
npm install

# Start the application
npm start
```

## 🛠 Tech Stack

- **Frontend**: Electron, Vanilla JS, WebRTC, Tailwind CSS.
- **Backend**: Python FastAPI, WebSockets, JWT Auth.
- **Infrastructure**: Optimized for P2P traffic with STUN/TURN support.

## 🔒 Security
- **JWT**: Ensures only authorized users can join specific rooms.
- **Bcrypt**: Securely hashes room passwords.
- **Privacy**: Media traffic is Peer-to-Peer and does not pass through our servers.

## 🎧 Advanced Audio Setup (Windows)

To achieve high-quality audio sharing where you can stream a specific application (like a Browser or Game) without capturing other sounds (like Discord or Spotify), you need to use a **Virtual Audio Cable**.

### Step 1: Install the Audio Driver
We recommend **VB-CABLE Driver** (Donationware) as it is reliable and widely used.

1.  Download the **VB-CABLE Driver** from the official website: [https://vb-audio.com/Cable/](https://vb-audio.com/Cable/)
2.  Extract the downloaded ZIP file.
3.  Right-click on `VBCABLE_Setup_x64.exe` and select **Run as Administrator**.
4.  Follow the prompts to install the driver.
5.  **Restart your computer** (Important!).

### Step 2: Route Your Application Audio
Now tell Windows to send your specific application's audio to the "Cable" instead of your speakers.

#### Understanding the "Cable"
*   **CABLE Input (Output Device/Speaker):** Think of this as the *entry point* of the virtual pipe. You route apps **TO** this.
*   **CABLE Output (Input Device/Microphone):** Think of this as the *exit point*. Vivid listens **FROM** this.

#### Configuration Steps
1.  Open **Windows Settings** > **System** > **Sound** > **Volume mixer**.
2.  **Crucial Check:** Ensure your main "System" Output (at the top) is set to your **Headphones**. If you set the main system to "Cable", you will capture the remote user's voice and cause an echo.
3.  Find the specific application you want to share (e.g., **Chrome**, **Spotify**, or a **Game**).
    *   *Tip: The app must be playing sound to appear. Look for the moving green audio bar to identify the correct process.*
4.  Change the **Output** dropdown (the top one next to the app) to **CABLE Input (VB-Audio Virtual Cable)**.

### Step 3: Configure Vivid
1.  Open **Vivid** and join a room.
2.  Click the **Share Screen** button.
3.  In the **Audio Device** dropdown at the bottom of the popup, select **CABLE Output (VB-Audio Virtual Cable)**.
4.  Select the screen or window you want to share and click "Share".

**Success!** The remote user will now hear ONLY the application you routed to the cable.

### Optional: Monitoring the Audio
By default, you won't hear the application yourself because it's playing into the "Cable". To hear it while sharing:

1.  Open **Windows Sound Control Panel** (press `Win+R`, type `mmsys.cpl`, and hit Enter).
2.  Go to the **Recording** tab.
3.  Right-click **CABLE Output** > **Properties**.
4.  Go to the **Listen** tab.
5.  Check **Listen to this device**.
6.  Select your headphones/speakers in the "Playback through this device" dropdown.
7.  Click Apply.
