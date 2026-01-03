document.addEventListener("DOMContentLoaded", () => {
  let localStream;
  let remoteStream;
  let remoteScreenStream;
  let peerConnection;
  let socket;
  let roomId;
  let authToken;
  let userName = "Guest";
  let isScreenSharing = false;

  let currentScreenStream;
  let currentScreenVideoTrack;
  let currentScreenSender;
  let currentScreenAudioSender;

  let iceCandidatesQueue = [];

  let rtcConfig = {
    iceServers: [
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
    ],
  };

  const joinScreen = document.getElementById("join-screen");
  const videoScreen = document.getElementById("video-screen");
  const joinBtn = document.getElementById("join-btn");
  const roomIdInput = document.getElementById("room-id");
  const roomPasswordInput = document.getElementById("room-password");
  const userNameInput = document.getElementById("user-name");
  const roomIdDisplay = document.getElementById("room-id-display");
  const roomInfo = document.getElementById("room-info");
  const toastContainer = document.getElementById("toast-container");
  const bootScreen = document.getElementById("boot-screen");

  const mainVideo = document.getElementById("main-video");
  const localVideo = document.getElementById("local-video");
  const remoteVideoOverlay = document.getElementById("remote-video-overlay");

  const localVideoContainer = document.getElementById("local-video-container");
  const remoteOverlayContainer = document.getElementById("remote-overlay-container");
  const screenSharePlaceholder = document.getElementById("screen-share-placeholder");

  const localMuteIndicator = document.getElementById("local-mute-indicator");
  const mainVideoMuteIndicator = document.getElementById("main-video-mute-indicator");
  const mainVideoOffIndicator = document.getElementById("main-video-off-indicator");
  const localVideoOffIndicator = document.getElementById("local-video-off-indicator");

  let isRemoteVideoEnabled = true;
  let isRemoteAudioEnabled = true;

  const localLabel = document.getElementById("local-label");
  const remoteLabel = document.getElementById("remote-label");
  const remoteOverlayLabel = document.getElementById("remote-overlay-label");
  const remoteLabelContainer = document.getElementById("remote-label-container");

  const sharedVolumeContainer = document.getElementById("shared-volume-container");
  const sharedVolumeSlider = document.getElementById("shared-volume-slider");
  let previousMainVolume = 1;

  const shareScreenBtn = document.getElementById("share-screen");
  const stopShareBtn = document.getElementById("stop-share");
  const leaveBtn = document.getElementById("leave-btn");
  const toggleMicBtn = document.getElementById("toggle-mic");
  const toggleVideoBtn = document.getElementById("toggle-video");
  const toggleFullscreenBtn = document.getElementById("toggle-fullscreen");

  const micMenuBtn = document.getElementById("mic-menu-btn");
  const micMenu = document.getElementById("mic-menu");
  const micListContainer = document.getElementById("mic-list");
  const speakerListContainer = document.getElementById("speaker-list");

  const iconMicOn = document.getElementById("icon-mic-on");
  const iconMicOff = document.getElementById("icon-mic-off");
  const iconVideoOn = document.getElementById("icon-video-on");
  const iconVideoOff = document.getElementById("icon-video-off");
  const iconFullscreenEnter = document.getElementById("icon-fullscreen-enter");
  const iconFullscreenExit = document.getElementById("icon-fullscreen-exit");

  const chatSidebar = document.getElementById("chat-sidebar");
  const closeChatBtn = document.getElementById("close-chat");
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const toggleChatBtn = document.getElementById("toggle-chat");
  const chatBadge = document.getElementById("chat-badge");

  if (micMenuBtn) {
    micMenuBtn.onclick = (e) => {
      e.stopPropagation();
      micMenu.classList.toggle("hidden");
    };
  }

  document.addEventListener("click", (e) => {
    if (
      micMenu &&
      micMenuBtn &&
      !micMenu.contains(e.target) &&
      !micMenuBtn.contains(e.target)
    ) {
      micMenu.classList.add("hidden");
    }
  });

  async function switchMicrophone(deviceId) {
    Logger.info("Switching microphone to:", deviceId);
    try {
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = newStream.getAudioTracks()[0];

      if (localStream) {
        const oldTrack = localStream.getAudioTracks()[0];
        if (oldTrack) oldTrack.stop();
        localStream.removeTrack(oldTrack);
        localStream.addTrack(newAudioTrack);
      }

      if (peerConnection) {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        } else {
          peerConnection.addTrack(newAudioTrack, localStream);
        }
      }
      Logger.success("Microphone switched successfully");
    } catch (e) {
      Logger.error("Failed to switch microphone", e);
      showToast("Failed to switch microphone");
    }
  }

  let isChatOpen = false;
  let selectedAudioInputId = "";
  let selectedAudioOutputId = "";

  const audioInputSelect = document.getElementById("audio-input-select");
  const audioOutputSelect = document.getElementById("audio-output-select");

  async function loadAudioDevices() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");

      if (audioInputSelect) {
        audioInputSelect.innerHTML = '<option value="">System Default</option>';
        inputs.forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.text = d.label || `Mic ${d.deviceId.slice(0, 5)}`;
          audioInputSelect.appendChild(opt);
        });
      }
      if (audioOutputSelect) {
        audioOutputSelect.innerHTML = '<option value="">System Default</option>';
        outputs.forEach((d) => {
          const opt = document.createElement("option");
          opt.value = d.deviceId;
          opt.text = d.label || `Speaker ${d.deviceId.slice(0, 5)}`;
          audioOutputSelect.appendChild(opt);
        });
      }

      const populateMenu = (container, list, type, currentId, onSelect) => {
        if (!container) return;
        container.innerHTML = "";
        const defaultItem = document.createElement("div");
        defaultItem.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm truncate flex justify-between items-center";
        defaultItem.innerText = "System Default";
        if (currentId === "") defaultItem.classList.add("text-blue-400", "font-bold");
        defaultItem.onclick = (e) => {
          e.stopPropagation();
          onSelect("");
          loadAudioDevices();
        };
        container.appendChild(defaultItem);

        list.forEach((d) => {
          const item = document.createElement("div");
          item.className = "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm truncate flex justify-between items-center";
          item.innerText = d.label || `${type} ${d.deviceId.slice(0, 5)}`;
          if (currentId === d.deviceId) item.classList.add("text-blue-400", "font-bold");
          item.onclick = (e) => {
            e.stopPropagation();
            onSelect(d.deviceId);
            loadAudioDevices();
          };
          container.appendChild(item);
        });
      };

      const savedIn = localStorage.getItem("vivid_audio_input");
      if (savedIn) {
        selectedAudioInputId = savedIn;
        if (audioInputSelect) audioInputSelect.value = savedIn;
      }

      const savedOut = localStorage.getItem("vivid_audio_output");
      if (savedOut) {
        selectedAudioOutputId = savedOut;
        if (audioOutputSelect) audioOutputSelect.value = savedOut;
      }

      populateMenu(micListContainer, inputs, "Mic", selectedAudioInputId, (id) => {
        selectedAudioInputId = id;
        localStorage.setItem("vivid_audio_input", id);
        switchMicrophone(id);
      });

      populateMenu(speakerListContainer, outputs, "Speaker", selectedAudioOutputId, (id) => {
        selectedAudioOutputId = id;
        localStorage.setItem("vivid_audio_output", id);
        applyAudioOutputDevice(id);
      });
    } catch (e) {
      Logger.error("Failed to load audio devices", e);
    }
  }

  loadAudioDevices();

  if (audioInputSelect) {
    audioInputSelect.onchange = () => {
      selectedAudioInputId = audioInputSelect.value;
      localStorage.setItem("vivid_audio_input", selectedAudioInputId);
    };
  }

  if (audioOutputSelect) {
    audioOutputSelect.onchange = () => {
      selectedAudioOutputId = audioOutputSelect.value;
      localStorage.setItem("vivid_audio_output", selectedAudioOutputId);
      applyAudioOutputDevice(selectedAudioOutputId);
    };
  }

  async function applyAudioOutputDevice(deviceId) {
    if (!deviceId) return;
    try {
      const elements = [mainVideo, remoteVideoOverlay];
      for (const el of elements) {
        if (el) {
          if (typeof el.setSinkId !== "function") {
            Logger.error("setSinkId is not supported in this browser/version.");
            continue;
          }
          await el.setSinkId(deviceId);
        }
      }
      Logger.info(`Audio output routed to device: ${deviceId}`);
    } catch (e) {
      Logger.warn("Failed to set audio output device", e);
    }
  }

  navigator.mediaDevices.ondevicechange = () => {
    Logger.info("Audio devices changed, reloading list...");
    loadAudioDevices();
  };

  let API_BASE_URL = window.location.origin;
  if (window.electronAPI && window.electronAPI.config && window.electronAPI.config.apiUrl) {
    API_BASE_URL = window.electronAPI.config.apiUrl.replace(/\/$/, "");
  }

  async function checkServerHealth() {
    const healthUrl = `${API_BASE_URL}/health`;
    let isConnected = false;
    const showBootTimer = setTimeout(() => {
      if (!isConnected && bootScreen) bootScreen.classList.remove("hidden");
    }, 500);

    const tryConnect = async () => {
      try {
        const res = await fetch(healthUrl, { headers: { "ngrok-skip-browser-warning": "true" } });
        if (res.ok) {
          isConnected = true;
          clearTimeout(showBootTimer);
          if (bootScreen) bootScreen.classList.add("hidden");
          Logger.info("Server is healthy/awake");
        } else {
          throw new Error("Server not ready");
        }
      } catch (e) {
        Logger.warn("Server health check failed, retrying...", e);
        setTimeout(tryConnect, 2000);
      }
    };
    tryConnect();
  }

  checkServerHealth();

  fetch(`${API_BASE_URL}/api/config`, { headers: { "ngrok-skip-browser-warning": "true" } })
    .then((res) => res.json())
    .then((config) => {
      if (config.is_production) {
        Logger.IS_PRODUCTION = true;
      }
    })
    .catch((err) => console.error("Failed to load client config", err));

  if (sharedVolumeSlider) {
    sharedVolumeSlider.oninput = (e) => {
      mainVideo.volume = parseFloat(e.target.value);
    };
  }

  if (joinBtn) {
    joinBtn.onclick = async () => {
      roomId = roomIdInput.value.trim();
      const password = roomPasswordInput.value.trim();
      const name = userNameInput.value.trim();
      
      if (!roomId || !password) {
        alert("Please enter both Room ID and Password");
        return;
      }

      // Disable button to prevent multiple clicks
      joinBtn.disabled = true;
      joinBtn.innerText = "Joining...";
      joinBtn.classList.add("opacity-50", "cursor-not-allowed");

      if (audioInputSelect) selectedAudioInputId = audioInputSelect.value;
      if (audioOutputSelect) selectedAudioOutputId = audioOutputSelect.value;

      userName = name || "User-" + Math.floor(Math.random() * 1000);

      try {
        const iceResp = await fetch(`${API_BASE_URL}/api/ice-config`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (iceResp.ok) {
          const fetchedConfig = await iceResp.json();
          if (fetchedConfig.iceServers) {
            fetchedConfig.iceServers = fetchedConfig.iceServers.map((server) => {
                if (typeof server.urls === "string") {
                  if (server.urls.startsWith("http")) return null;
                } else if (Array.isArray(server.urls)) {
                  server.urls = server.urls.filter((u) => !u.startsWith("http"));
                  if (server.urls.length === 0) return null;
                }
                return server;
              }).filter(Boolean);
            rtcConfig = fetchedConfig;
            Logger.info("Loaded ICE servers configuration");
          }
        }

        const response = await fetch(`${API_BASE_URL}/api/join`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({ room_id: roomId, password: password }),
        });

        if (!response.ok) {
          const err = await response.json();
          alert(err.detail || "Login failed");
          Logger.error("Login failed:", err.detail);
          
          // Re-enable button on failure
          joinBtn.disabled = false;
          joinBtn.innerText = "Join";
          joinBtn.classList.remove("opacity-50", "cursor-not-allowed");
          return;
        }

        const data = await response.json();
        authToken = data.access_token;
        Logger.success("Joined room successfully");

        joinScreen.classList.add("hidden");
        videoScreen.classList.remove("hidden");
        roomInfo.classList.remove("hidden");
        roomIdDisplay.innerText = roomId;
        localLabel.innerText = userName + " (You)";

        await startCall();
      } catch (err) {
        alert("Could not connect to server");
        Logger.error("Could not connect to server", err);
        
        // Re-enable button on network error
        joinBtn.disabled = false;
        joinBtn.innerText = "Join";
        joinBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    };
  }

  if (shareScreenBtn) shareScreenBtn.onclick = startScreenShare;
  if (stopShareBtn) stopShareBtn.onclick = stopScreenShare;
  if (leaveBtn) leaveBtn.onclick = () => window.location.reload();
  if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;
  if (toggleVideoBtn) toggleVideoBtn.onclick = toggleVideo;
  if (toggleFullscreenBtn) toggleFullscreenBtn.onclick = toggleFullscreen;

  if (toggleChatBtn) toggleChatBtn.onclick = toggleChat;
  if (closeChatBtn) closeChatBtn.onclick = toggleChat;
  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      sendChatMessage();
    };
  }

  document.addEventListener("fullscreenchange", updateFullscreenIcon);

  if (mainVideo) {
    mainVideo.addEventListener("leavepictureinpicture", () => {
      Logger.info("Main Video left PIP");
    });
  }

  if (localVideoContainer) setupDraggable(localVideoContainer);
  if (remoteOverlayContainer) setupDraggable(remoteOverlayContainer);
  setupPIPControls();

  function toggleChat() {
    isChatOpen = !isChatOpen;
    if (isChatOpen) {
      chatSidebar.classList.remove("hidden");
      chatBadge.classList.add("hidden");
      setTimeout(() => chatInput.focus(), 100);
    } else {
      chatSidebar.classList.add("hidden");
    }
  }

  function sendChatMessage() {
    const text = chatInput.value.trim();
    if (!text) return;
    appendChatMessage(text, "local");
    sendSignal({ type: "chat", text: text });
    chatInput.value = "";
  }

  function appendChatMessage(text, type) {
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("chat-message", type);
    msgDiv.innerText = text;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function toggleFullscreen() {
    const container = document.getElementById("video-screen");
    if (!document.fullscreenElement) {
      container.requestFullscreen().catch((err) => {
        Logger.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  }

  function updateFullscreenIcon() {
    if (document.fullscreenElement) {
      iconFullscreenEnter.classList.add("hidden");
      iconFullscreenExit.classList.remove("hidden");
      toggleFullscreenBtn.title = "Exit Fullscreen";
    } else {
      iconFullscreenEnter.classList.remove("hidden");
      iconFullscreenExit.classList.add("hidden");
      toggleFullscreenBtn.title = "Enter Fullscreen";
    }
  }

  async function startCall() {
    try {
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (selectedAudioInputId) {
        audioConstraints.deviceId = { exact: selectedAudioInputId };
      }

      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: audioConstraints,
        });
      } catch (avErr) {
        Logger.warn("Could not get Audio+Video, trying Audio only...", avErr);
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: audioConstraints,
          });
          showToast("Camera access denied/failed. Joining with Audio only.");
        } catch (aErr) {
          Logger.warn("Could not get Audio, joining as receive-only...", aErr);
          localStream = new MediaStream();
          showToast("Microphone access denied/failed. Joining as receive-only.");
        }
      }

      if (localStream.getVideoTracks().length > 0) {
        mainVideo.srcObject = localStream;
        mainVideo.muted = true;
        mainVideo.classList.add("mirror");
        localVideo.srcObject = localStream;
        localVideoContainer.classList.add("hidden");
      } else {
        localVideoContainer.classList.add("hidden");
      }

      if (localStream.getAudioTracks().length === 0) {
        toggleMicBtn.disabled = true;
        toggleMicBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      if (localStream.getVideoTracks().length === 0) {
        toggleVideoBtn.disabled = true;
        toggleVideoBtn.classList.add("opacity-50", "cursor-not-allowed");
      }

      Logger.info("Local media stream acquired");
      connectSocket();
    } catch (err) {
      alert("Unexpected error starting call: " + err.message);
      Logger.error("Critical error in startCall", err);
    }
  }

  function connectSocket() {
    let wsProtocol = "ws:";
    let host = window.location.host;
    if (API_BASE_URL.startsWith("http")) {
      const urlObj = new URL(API_BASE_URL);
      wsProtocol = urlObj.protocol === "https:" ? "wss:" : "ws:";
      host = urlObj.host;
    } else {
      wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    }

    socket = new WebSocket(`${wsProtocol}//${host}/ws/${roomId}?token=${authToken}`);

    socket.onopen = () => {
      Logger.success("WebSocket connected");
      reconnectAttempts = 0; // Reset counter on success
      setTimeout(() => {
        sendSignal({ type: "announce", name: userName });
      }, 500);
    };

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      Logger.debug("Received signal:", msg.type);
      handleSignalMessage(msg);
    };

    socket.onclose = (event) => {
      if (event.code === 1008 || event.code === 403) {
        alert("Connection closed: " + event.reason);
        window.location.reload();
      } else {
        // Reconnection Logic
        if (reconnectAttempts < 5) {
          reconnectAttempts++;
          const delay = 10000; // 10 seconds
          showToast(`Connection lost. Retrying in 10s... (Attempt ${reconnectAttempts}/5)`);
          Logger.warn(`Socket closed. Retrying in ${delay}ms... Attempt ${reconnectAttempts}/5`);
          setTimeout(connectSocket, delay);
        } else {
          alert("Lost connection to the server. Please log in again.");
          window.location.reload();
        }
      }
    };
  }
  
  let reconnectAttempts = 0;

  async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);

      if (!remoteStream) {
        remoteStream = stream;
        switchToConnectedView();
      } else if (remoteStream.id !== stream.id) {
        // Second stream is Screen Share
        remoteScreenStream = stream;

        // Unified Strategy for Normal View:
        // Main=Screen, Overlay=Face
        // Only if NOT in PiP.
        if (!document.body.classList.contains("pip-mode")) {
            mainVideo.srcObject = remoteScreenStream;
            mainVideo.classList.remove("mirror");
            
            // Show Overlay for Face
            remoteVideoOverlay.srcObject = remoteStream;
            remoteVideoOverlay.muted = false; 
            remoteOverlayContainer.classList.remove("hidden");
            
            previousMainVolume = mainVideo.volume;
            sharedVolumeContainer.classList.remove("hidden");
            sharedVolumeSlider.value = previousMainVolume;
        }

        stream.onremovetrack = () => {
          remoteScreenStream = null;
          // Revert to face
          mainVideo.srcObject = remoteStream;
          
          // Hide Overlay
          remoteOverlayContainer.classList.add("hidden");
          remoteVideoOverlay.srcObject = null;
          
          sharedVolumeContainer.classList.add("hidden");
          mainVideo.volume = previousMainVolume;
        };
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal({ type: "ice-candidate", candidate: event.candidate });
      }
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === "failed") {
        peerConnection.restartIce();
      }
    };

    peerConnection.onnegotiationneeded = () => {
      if (peerConnection._negotiationTimer) {
        clearTimeout(peerConnection._negotiationTimer);
      }
      peerConnection._negotiationTimer = setTimeout(async () => {
        if (peerConnection.signalingState !== "stable") return;
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          sendSignal({ type: "offer", sdp: offer });
        } catch (err) {
          Logger.error("Error during negotiation:", err);
        }
      }, 500);
    };
  }

  function switchToConnectedView() {
    localVideo.srcObject = localStream;
    localVideoContainer.classList.remove("hidden");

    if (mainVideo.srcObject !== remoteStream) {
      mainVideo.srcObject = remoteStream;
    }

    mainVideo.muted = false;
    mainVideo.classList.remove("mirror");
    remoteLabelContainer.classList.remove("hidden");

    if (mainVideo.paused) mainVideo.play().catch((e) => {});

    applyAudioOutputDevice(selectedAudioOutputId);
    updateRemoteVideoUI();
    updateRemoteAudioUI();
  }

  async function handleSignalMessage(msg) {
    if (!peerConnection && msg.type !== "mic-status" && msg.type !== "chat" && msg.type !== "welcome")
      await createPeerConnection();

    switch (msg.type) {
      case "announce":
        showToast(`${msg.name} has joined!`);
        remoteLabel.innerText = msg.name || "Remote";
        if (remoteOverlayLabel) remoteOverlayLabel.innerText = msg.name || "Remote";
        setTimeout(() => {
          sendSignal({ type: "welcome", name: userName });
        }, 1000);
        break;

      case "welcome":
        if (msg.name) {
            remoteLabel.innerText = msg.name;
            if (remoteOverlayLabel) remoteOverlayLabel.innerText = msg.name;
        }
        break;

      case "offer":
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          processIceQueue();
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          sendSignal({ type: "answer", sdp: answer });
        } catch (err) {
          Logger.error("Error handling Offer:", err);
        }
        break;

      case "answer":
        try {
          if (peerConnection.signalingState !== "have-local-offer") return;
          await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          processIceQueue();
        } catch (err) {
          Logger.error("Error handling Answer:", err);
        }
        break;

      case "ice-candidate":
        if (peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {}
        } else {
          iceCandidatesQueue.push(msg.candidate);
        }
        break;

      case "mic-status":
        isRemoteAudioEnabled = msg.enabled;
        updateRemoteAudioUI();
        break;

      case "video-status":
        isRemoteVideoEnabled = msg.enabled;
        updateRemoteVideoUI();
        break;

      case "screen-share-status":
        if (msg.isSharing) {
          showToast("Remote user is sharing their screen");
          mainVideo.classList.remove("mirror");
        } else {
          showToast("Remote user stopped sharing screen");
        }
        break;

      case "chat":
        appendChatMessage(msg.text, "remote");
        if (!isChatOpen) chatBadge.classList.remove("hidden");
        break;

      case "user-left":
        handleUserLeft();
        break;
    }
  }

  function handleUserLeft() {
    showToast("Remote user has left the room.");
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    remoteStream = null;
    switchToWaitingView();
    chatMessages.innerHTML = "";
    const info = document.createElement("div");
    info.className = "text-center text-gray-500 text-sm italic";
    info.innerText = "Session ended. Chat cleared.";
    chatMessages.appendChild(info);
  }

  function switchToWaitingView() {
    mainVideo.srcObject = localStream;
    mainVideo.muted = true;
    mainVideo.classList.add("mirror");

    localVideoContainer.classList.add("hidden");
    localVideoContainer.classList.remove("minimized");
    localVideoContainer.style.width = "";
    localVideoContainer.style.height = "";
    
    remoteOverlayContainer.classList.add("hidden");
    remoteOverlayContainer.classList.remove("minimized");
    remoteOverlayContainer.style.width = "";
    remoteOverlayContainer.style.height = "";

    remoteLabelContainer.classList.add("hidden");
    if (sharedVolumeContainer) sharedVolumeContainer.classList.add("hidden");

    mainVideoMuteIndicator.classList.add("hidden");
    mainVideoOffIndicator.classList.add("hidden");

    isRemoteVideoEnabled = true;
    isRemoteAudioEnabled = true;
    remoteLabel.innerText = "Remote";
  }

  async function processIceQueue() {
    while (iceCandidatesQueue.length > 0) {
      const candidate = iceCandidatesQueue.shift();
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    }
  }

  function sendSignal(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "bg-blue-600 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-500 opacity-0";
    toast.innerText = message;
    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.remove("opacity-0"));
    setTimeout(() => {
      toast.classList.add("opacity-0");
      setTimeout(() => toast.remove(), 500);
    }, 3000);
    appendChatMessage(message, "system");
  }

  function toggleMic() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const isEnabled = audioTrack.enabled;
        if (isEnabled) {
          toggleMicBtn.classList.remove("bg-red-600", "hover:bg-red-700");
          toggleMicBtn.classList.add("hover:bg-gray-600");
          iconMicOn.classList.remove("hidden");
          iconMicOff.classList.add("hidden");
          localMuteIndicator.classList.add("hidden");
        } else {
          toggleMicBtn.classList.remove("hover:bg-gray-600");
          toggleMicBtn.classList.add("bg-red-600", "hover:bg-red-700");
          iconMicOn.classList.add("hidden");
          iconMicOff.classList.remove("hidden");
          localMuteIndicator.classList.remove("hidden");
        }
        sendSignal({ type: "mic-status", enabled: isEnabled });
      } else {
        showToast("No microphone detected.");
      }
    }
  }

  function toggleVideo() {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        if (videoTrack.enabled) {
          toggleVideoBtn.classList.replace("bg-red-600", "bg-gray-700");
          toggleVideoBtn.classList.replace("hover:bg-red-700", "hover:bg-gray-600");
          iconVideoOn.classList.remove("hidden");
          iconVideoOff.classList.add("hidden");
          localVideoOffIndicator.classList.add("hidden");
          if (remoteStream) localVideoContainer.classList.remove("hidden");
        } else {
          toggleVideoBtn.classList.replace("bg-gray-700", "bg-red-600");
          toggleVideoBtn.classList.replace("hover:bg-gray-600", "hover:bg-red-700");
          iconVideoOn.classList.add("hidden");
          iconVideoOff.classList.remove("hidden");
          localVideoOffIndicator.classList.remove("hidden");
        }
        sendSignal({ type: "video-status", enabled: videoTrack.enabled });
      } else {
        showToast("No camera detected.");
      }
    }
  }

  if (window.electronAPI) {
    document.getElementById("title-bar").classList.remove("hidden");

    document.getElementById("min-btn").onclick = () => {
      enterPiP();
    };
    document.getElementById("max-btn").onclick = () => window.electronAPI.maximizeWindow();
    document.getElementById("close-btn").onclick = () => window.electronAPI.closeWindow();

    window.electronAPI.onAppBlur(() => {
      enterPiP();
    });

    window.electronAPI.onPipModeChanged((isPip) => {
      const titleBar = document.getElementById("title-bar");
      const controlsBar = document.getElementById("controls-bar");
      const chatSidebar = document.getElementById("chat-sidebar");
      const localVideoContainer = document.getElementById("local-video-container");
      
      if (isPip) {
        document.body.classList.add("pip-mode");
        
        // Inject Custom PiP Header (Move Bar + Restore Button)
        let pipHeader = document.getElementById("pip-header-bar");
        if (!pipHeader) {
            pipHeader = document.createElement("div");
            pipHeader.id = "pip-header-bar";
            pipHeader.innerHTML = `
                <div class="drag-area"></div>
                <button id="pip-restore-btn" title="Exit Picture-in-Picture">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
            `;
            document.body.appendChild(pipHeader);
            
            const btn = document.getElementById("pip-restore-btn");
            if (btn) {
                btn.onclick = (e) => {
                    e.stopPropagation(); 
                    window.electronAPI.togglePip(false);
                };
            }
        }
        
        // Hide UI Elements manually
        if (titleBar) titleBar.style.display = "none";
        if (controlsBar) controlsBar.style.display = "none";
        if (chatSidebar) chatSidebar.style.display = "none";
        if (localVideoContainer) localVideoContainer.style.display = "none";
        
        // Hide Overlay logic for PiP
        if (remoteOverlayContainer) {
            remoteOverlayContainer.style.display = "none"; // Hide small overlay in PiP
        }

        // UNIFIED PIP: Show Face
        if (remoteStream) {
            mainVideo.srcObject = remoteStream;
            mainVideo.style.display = "block"; 
            mainVideo.play().catch(() => {});
        }
      } else {
        document.body.classList.remove("pip-mode");
        
        const pipHeader = document.getElementById("pip-header-bar");
        if (pipHeader) pipHeader.remove();
        
        // Restore UI Elements
        if (titleBar) titleBar.style.display = "";
        if (controlsBar) controlsBar.style.display = "";
        if (chatSidebar) chatSidebar.style.display = "";
        if (localVideoContainer) localVideoContainer.style.display = "";

        // RESTORE MAIN VIEW
        if (isScreenSharing) {
            mainVideo.style.display = "none";
            // Show overlay if possible? 
            if (remoteStream) {
                remoteVideoOverlay.srcObject = remoteStream;
                remoteVideoOverlay.muted = false;
                remoteOverlayContainer.classList.remove("hidden");
                remoteOverlayContainer.style.display = "";
            }
        } else if (remoteScreenStream) {
            // View Screen Share, Face in Overlay
            mainVideo.srcObject = remoteScreenStream;
            mainVideo.style.display = "block";
            
            remoteVideoOverlay.srcObject = remoteStream;
            remoteVideoOverlay.muted = false;
            remoteOverlayContainer.classList.remove("hidden");
            remoteOverlayContainer.style.display = "";
        } else {
            // Normal Call
            if (remoteStream) {
                mainVideo.srcObject = remoteStream;
                mainVideo.style.display = "block";
            }
            remoteOverlayContainer.classList.add("hidden");
        }
      }
    });
  }

  function enterPiP() {
    if (!remoteStream) return;
    if (window.electronAPI) {
        window.electronAPI.togglePip(true);
        return;
    }
    // Web implementation omitted
  }

  const sourcesModal = document.getElementById("sources-modal");
  const closeSourcesBtn = document.getElementById("close-sources-btn");
  const sourcesList = document.getElementById("sources-list");
  const shareAudioCheck = document.getElementById("share-audio-check");
  const fpsSelect = document.getElementById("fps-select");
  const audioHelpBtn = document.getElementById("audio-help-btn");

  if (closeSourcesBtn) closeSourcesBtn.onclick = () => sourcesModal.classList.add("hidden");
  if (audioHelpBtn && window.electronAPI) audioHelpBtn.onclick = () => window.electronAPI.openAudioGuide();

  let audioOutputBeforeScreenShare = null;
  let isAudioReroutedForScreenShare = false;

  async function rerouteAudioForScreenShare() {
    if (isAudioReroutedForScreenShare) return;
    try {
      audioOutputBeforeScreenShare = selectedAudioOutputId;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      if (outputs.length > 1) {
        showToast("⚠️ Screen audio enabled: Use headphones.");
      } else {
        showToast("⚠️ Please use HEADPHONES to prevent echo.");
      }
      isAudioReroutedForScreenShare = true;
    } catch (e) {
      Logger.error("Failed to prepare audio routing", e);
    }
  }

  async function restoreAudioRouting() {
    if (!isAudioReroutedForScreenShare) return;
    try {
      if (audioOutputBeforeScreenShare) {
        await applyAudioOutputDevice(audioOutputBeforeScreenShare);
        selectedAudioOutputId = audioOutputBeforeScreenShare;
      }
      isAudioReroutedForScreenShare = false;
    } catch (e) {
      Logger.error("Failed to restore audio routing", e);
    }
  }

  const systemAudioSelect = document.getElementById("system-audio-device-select");

  async function startScreenShare() {
    if (window.electronAPI) {
      try {
        const sources = await window.electronAPI.getScreenSources();
        populateSourcesList(sources);
        if (systemAudioSelect) {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            systemAudioSelect.innerHTML = '<option value="">Audio Device: Auto</option>';
            devices.filter(d => d.kind === 'audioinput').forEach(d => {
                 const opt = document.createElement("option");
                 opt.value = d.deviceId;
                 opt.text = d.label || `Audio Input ${d.deviceId.slice(0, 5)}`;
                 systemAudioSelect.appendChild(opt);
            });
          } catch (e) {}
        }
        sourcesModal.classList.remove("hidden");
      } catch (err) {
        Logger.error("Failed to get sources", err);
      }
      return;
    }

    // Web Fallback
    try {
        // Prepare constraints for standard browser screen sharing
        // Note: System audio sharing is browser-dependent (tick box in Chrome dialog)
        const constraints = {
            video: { cursor: "always" },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 44100
            }
        };
        
        currentScreenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
        handleScreenStreamAcquired();
    } catch (err) {
        Logger.error("Error sharing screen (Web):", err);
        showToast("Failed to share screen");
    }
  }

  function populateSourcesList(sources) {
    sourcesList.innerHTML = "";
    sources.forEach((source) => {
      const div = document.createElement("div");
      div.className = "source-item p-2 rounded flex flex-col items-center";
      div.onclick = () => selectSource(source.id);
      const img = document.createElement("img");
      img.src = source.thumbnail;
      img.className = "source-thumbnail";
      const label = document.createElement("span");
      label.className = "text-xs text-center truncate w-full";
      label.innerText = source.name;
      div.appendChild(img);
      div.appendChild(label);
      sourcesList.appendChild(div);
    });
  }

  async function selectSource(sourceId) {
    sourcesModal.classList.add("hidden");
    const shareAudio = shareAudioCheck.checked;
    const fps = parseInt(fpsSelect.value);
    const customAudioDeviceId = systemAudioSelect ? systemAudioSelect.value : "";

    try {
      if (shareAudio && !customAudioDeviceId) await rerouteAudioForScreenShare();

      const constraints = {
        audio: shareAudio && !customAudioDeviceId ? {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            } : false,
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
            minFrameRate: fps,
            maxFrameRate: fps,
          },
        },
      };

      currentScreenStream = await navigator.mediaDevices.getUserMedia(constraints);

      if (customAudioDeviceId) {
          try {
              const audioStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                      deviceId: { exact: customAudioDeviceId },
                      echoCancellation: false,
                      autoGainControl: false,
                      noiseSuppression: false
                  }
              });
              const audioTrack = audioStream.getAudioTracks()[0];
              if (audioTrack) currentScreenStream.addTrack(audioTrack);
          } catch (audioErr) {}
      } else {
          const audioTrack = currentScreenStream.getAudioTracks()[0];
          if (audioTrack) {
            try {
              await audioTrack.applyConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
              });
            } catch (e) {}
          }
      }

      handleScreenStreamAcquired();
    } catch (err) {
      showToast("Failed to share selected screen.");
      if (shareAudio) await restoreAudioRouting();
    }
  }

  function handleScreenStreamAcquired() {
    currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];
    const screenAudioTrack = currentScreenStream.getAudioTracks()[0];

    if (peerConnection) {
      currentScreenSender = peerConnection.addTrack(currentScreenVideoTrack, currentScreenStream);
      if (screenAudioTrack) {
        currentScreenAudioSender = peerConnection.addTrack(screenAudioTrack, currentScreenStream);
      }
    }

    updateUIForScreenShare(true);
    currentScreenVideoTrack.onended = () => stopScreenShare();
    isScreenSharing = true;
    sendSignal({ type: "screen-share-status", isSharing: true });
  }

  async function stopScreenShare() {
    if (!isScreenSharing) return;
    if (peerConnection) {
      if (currentScreenSender) {
        peerConnection.removeTrack(currentScreenSender);
        currentScreenSender = null;
      }
      if (currentScreenAudioSender) {
        peerConnection.removeTrack(currentScreenAudioSender);
        currentScreenAudioSender = null;
      }
    }
    if (currentScreenStream) {
      currentScreenStream.getTracks().forEach((track) => track.stop());
      currentScreenStream = null;
    }
    await restoreAudioRouting();
    updateUIForScreenShare(false);
    isScreenSharing = false;
    sendSignal({ type: "screen-share-status", isSharing: false });
  }

  function updateUIForScreenShare(isSharing) {
    if (isSharing) {
      mainVideo.style.display = "none";
      mainVideo.muted = true;
      screenSharePlaceholder.classList.remove("hidden");
      screenSharePlaceholder.style.display = "flex";
      shareScreenBtn.classList.replace("bg-blue-600", "bg-green-600");
      shareScreenBtn.title = "Change Window";
      stopShareBtn.classList.remove("hidden");
      
      // SHOW OVERLAY (FACE)
      if (remoteStream) {
          remoteVideoOverlay.srcObject = remoteStream;
          remoteVideoOverlay.muted = false;
          remoteOverlayContainer.classList.remove("hidden");
      }
    } else {
      mainVideo.style.display = "block";
      if (remoteStream) {
        mainVideo.srcObject = remoteScreenStream || remoteStream;
        mainVideo.muted = false;
      }
      screenSharePlaceholder.classList.add("hidden");
      screenSharePlaceholder.style.display = "none";
      shareScreenBtn.classList.replace("bg-green-600", "bg-blue-600");
      shareScreenBtn.title = "Share Screen";
      stopShareBtn.classList.add("hidden");
      
      // HIDE OVERLAY
      remoteOverlayContainer.classList.add("hidden");
    }
    updateRemoteVideoUI();
    updateRemoteAudioUI();
  }

  function setupDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    element.onmousedown = dragMouseDown;
    element.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      if (document.body.classList.contains("pip-mode")) return;
      const rect = element.getBoundingClientRect();
      if (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
      if (document.body.classList.contains("pip-mode")) return;
      const touch = e.touches[0];
      const rect = element.getBoundingClientRect();
      if (touch.clientX > rect.right - 30 && touch.clientY > rect.bottom - 30) return;
      pos3 = touch.clientX;
      pos4 = touch.clientY;
      document.ontouchend = closeDragElement;
      document.ontouchmove = elementTouchDrag;
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      updatePosition();
    }

    function elementTouchDrag(e) {
      const touch = e.touches[0];
      pos1 = pos3 - touch.clientX;
      pos2 = pos4 - touch.clientY;
      pos3 = touch.clientX;
      pos4 = touch.clientY;
      updatePosition();
    }

    function updatePosition() {
      element.style.top = element.offsetTop - pos2 + "px";
      element.style.left = element.offsetLeft - pos1 + "px";
      element.style.bottom = "auto";
      element.style.right = "auto";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      document.ontouchend = null;
      document.ontouchmove = null;
    }
  }

  function setupPIPControls() {
    const containers = [localVideoContainer, remoteOverlayContainer];
    containers.forEach((container) => {
      if (!container) return;
      const minimizeBtn = container.querySelector(".minimize-btn");
      const restoreOverlay = container.querySelector(".restore-overlay");
      if (minimizeBtn) {
        minimizeBtn.onclick = (e) => {
          e.stopPropagation();
          container.classList.add("minimized");
        };
      }
      if (restoreOverlay) {
        restoreOverlay.onclick = (e) => {
          e.stopPropagation();
          container.classList.remove("minimized");
        };
      }
    });
  }

  function updateRemoteVideoUI() {
    if (!remoteStream) return;
    if (isRemoteVideoEnabled) {
      mainVideoOffIndicator.classList.add("hidden");
    } else {
      mainVideoOffIndicator.classList.remove("hidden");
    }
  }

  function updateRemoteAudioUI() {
    if (!remoteStream) return;
    if (!isRemoteAudioEnabled) {
      mainVideoMuteIndicator.classList.remove("hidden");
    } else {
      mainVideoMuteIndicator.classList.add("hidden");
    }
  }

  const pipStyle = document.createElement('style');
  pipStyle.textContent = `
    /* HIDE UI ELEMENTS */
    body.pip-mode #title-bar { display: none !important; }
    body.pip-mode header { display: none !important; }
    body.pip-mode #controls-bar { display: none !important; }
    body.pip-mode #chat-sidebar { display: none !important; }
    body.pip-mode #local-video-container { display: none !important; }
    body.pip-mode #join-screen { display: none !important; }
    body.pip-mode #boot-screen { display: none !important; }
    body.pip-mode #screen-share-placeholder { display: none !important; }
    body.pip-mode #sources-modal { display: none !important; }
    body.pip-mode .source-item { display: none !important; }
    body.pip-mode .pip-header { display: none !important; }
    
    body.pip-mode {
        background: black !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
    }

    body.pip-mode #video-screen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 9999 !important;
        background: black !important;
    }
    
    body.pip-mode #video-container {
        width: 100% !important;
        height: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    /* Ensure the Main Video fills the PiP window perfectly without padding */
    body.pip-mode #main-video {
        width: 100% !important;
        height: 100% !important;
        object-fit: cover !important;
        border: none !important;
        box-shadow: none !important;
    }

    /* --- PIP HEADER BAR (Move + Restore) --- */
    #pip-header-bar {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 40px;
        z-index: 20000;
        display: flex;
        justify-content: flex-end; /* Align button to right */
        align-items: center;
        background: linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);
        opacity: 0; /* Hidden by default */
        transition: opacity 0.2s ease;
        padding: 0 10px;
        box-sizing: border-box;
    }
    
    /* Show on Hover */
    body.pip-mode:hover #pip-header-bar {
        opacity: 1;
    }
    
    /* Drag Area (Invisible filler) */
    #pip-header-bar .drag-area {
        flex-grow: 1;
        height: 100%;
        -webkit-app-region: drag; /* DRAGGABLE */
    }
    
    /* Restore Button */
    #pip-restore-btn {
        width: 28px;
        height: 28px;
        color: white;
        background: rgba(255,255,255,0.1);
        border-radius: 4px;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        margin-left: 10px;
        -webkit-app-region: no-drag; /* CLICKABLE */
        backdrop-filter: blur(4px);
    }
    #pip-restore-btn:hover {
        background: rgba(255,255,255,0.3);
    }
    #pip-restore-btn svg {
        width: 18px;
        height: 18px;
    }
  	`;
  document.head.appendChild(pipStyle);
});
