document.addEventListener("DOMContentLoaded", () => {
  let localStream;
  let remoteStream;
  let remoteScreenStream; // New: For receiving screen share
  let peerConnection;
  let socket;
  let roomId;
  let authToken;
  let userName = "Guest";
  let isScreenSharing = false;

  let currentScreenStream;
  let currentScreenVideoTrack;
  let currentScreenSender; // New: To track the sender for removal
  let currentScreenAudioSender; // New: To track the audio sender for removal

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
  const remoteOverlayContainer = document.getElementById(
    "remote-overlay-container",
  );
  const screenSharePlaceholder = document.getElementById(
    "screen-share-placeholder",
  );

  const localMuteIndicator = document.getElementById("local-mute-indicator");

  // Indicators
  const mainVideoMuteIndicator = document.getElementById(
    "main-video-mute-indicator",
  );
  const mainVideoOffIndicator = document.getElementById(
    "main-video-off-indicator",
  );
  const localVideoOffIndicator = document.getElementById(
    "local-video-off-indicator",
  );

  const remoteOverlayVideoOffIndicator = document.getElementById(
    "remote-overlay-video-off-indicator",
  );
  const remoteOverlayMuteIndicator = document.getElementById(
    "remote-overlay-mute-indicator",
  );

  // Remote State
  let isRemoteVideoEnabled = true;
  let isRemoteAudioEnabled = true;

  const localLabel = document.getElementById("local-label");
  const remoteLabel = document.getElementById("remote-label");
  const remoteOverlayLabel = document.getElementById("remote-overlay-label");
  const remoteLabelContainer = document.getElementById(
    "remote-label-container",
  );

  const sharedVolumeContainer = document.getElementById(
    "shared-volume-container",
  );
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

  // Chat Elements
  const chatSidebar = document.getElementById("chat-sidebar");
  const closeChatBtn = document.getElementById("close-chat");
  const chatMessages = document.getElementById("chat-messages");
  const chatForm = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const toggleChatBtn = document.getElementById("toggle-chat");
  const chatBadge = document.getElementById("chat-badge");

  // Toggle Popover
  if (micMenuBtn) {
    micMenuBtn.onclick = (e) => {
      e.stopPropagation();
      micMenu.classList.toggle("hidden");
    };
  }

  // Close popover on click outside
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

      // Replace track in PeerConnection
      if (peerConnection) {
        const sender = peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "audio");
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        } else {
          // If no audio sender existed, add one (renegotiation needed)
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

  // --- Audio Output Management ---
  const audioInputSelect = document.getElementById("audio-input-select");
  const audioOutputSelect = document.getElementById("audio-output-select");

  async function loadAudioDevices() {
    try {
      // Prompt for permission first to get labels
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const devices = await navigator.mediaDevices.enumerateDevices();

      const inputs = devices.filter((d) => d.kind === "audioinput");
      const outputs = devices.filter((d) => d.kind === "audiooutput");

      // Populate Join Screen Selects
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

      // Populate Popover Menus
      const populateMenu = (container, list, type, currentId, onSelect) => {
        if (!container) return;
        container.innerHTML = "";

        // Add Default Option
        const defaultItem = document.createElement("div");
        defaultItem.className =
          "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm truncate flex justify-between items-center";
        defaultItem.innerText = "System Default";
        if (currentId === "")
          defaultItem.classList.add("text-blue-400", "font-bold");
        defaultItem.onclick = (e) => {
          e.stopPropagation();
          onSelect("");
          loadAudioDevices(); // Refresh highlight
        };
        container.appendChild(defaultItem);

        list.forEach((d) => {
          const item = document.createElement("div");
          item.className =
            "px-4 py-2 hover:bg-gray-700 cursor-pointer text-sm truncate flex justify-between items-center";
          item.innerText = d.label || `${type} ${d.deviceId.slice(0, 5)}`;
          if (currentId === d.deviceId)
            item.classList.add("text-blue-400", "font-bold");

          item.onclick = (e) => {
            e.stopPropagation();
            onSelect(d.deviceId);
            loadAudioDevices(); // Refresh highlight
          };
          container.appendChild(item);
        });
      };

      // Restore selections from localStorage
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

      populateMenu(
        micListContainer,
        inputs,
        "Mic",
        selectedAudioInputId,
        (id) => {
          selectedAudioInputId = id;
          localStorage.setItem("vivid_audio_input", id);
          switchMicrophone(id);
        },
      );

      populateMenu(
        speakerListContainer,
        outputs,
        "Speaker",
        selectedAudioOutputId,
        (id) => {
          selectedAudioOutputId = id;
          localStorage.setItem("vivid_audio_output", id);
          applyAudioOutputDevice(id);
        },
      );
    } catch (e) {
      Logger.error("Failed to load audio devices", e);
    }
  }

  // Load devices on startup
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

  // Reload devices if hardware changes (plug/unplug)
  navigator.mediaDevices.ondevicechange = () => {
    Logger.info("Audio devices changed, reloading list...");
    loadAudioDevices();
  };

  // --- API Configuration ---
  let API_BASE_URL = window.location.origin;
  if (
    window.electronAPI &&
    window.electronAPI.config &&
    window.electronAPI.config.apiUrl
  ) {
    API_BASE_URL = window.electronAPI.config.apiUrl.replace(/\/$/, "");
  }

  // --- Server Health Check (Wake up Render) ---
  async function checkServerHealth() {
    const healthUrl = `${API_BASE_URL}/health`;
    let isConnected = false;

    // If request takes longer than 500ms, show the boot screen
    const showBootTimer = setTimeout(() => {
      if (!isConnected) {
        if (bootScreen) bootScreen.classList.remove("hidden");
      }
    }, 500);

    const tryConnect = async () => {
      try {
        const res = await fetch(healthUrl, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
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
        setTimeout(tryConnect, 2000); // Retry every 2s
      }
    };

    tryConnect();
  }

  // Start the check immediately
  checkServerHealth();

  // Fetch Client Config (Logging, etc.)
  fetch(`${API_BASE_URL}/api/config`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  })
    .then((res) => res.json())
    .then((config) => {
      if (config.is_production) {
        Logger.IS_PRODUCTION = true;
      }
    })
    .catch((err) => console.error("Failed to load client config", err));

  // Shared Audio Volume Listener
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
      
      if (audioInputSelect) selectedAudioInputId = audioInputSelect.value;
      if (audioOutputSelect) selectedAudioOutputId = audioOutputSelect.value;

      userName = name || "User-" + Math.floor(Math.random() * 1000);

      if (!roomId || !password) {
        alert("Please enter both Room ID and Password");
        return;
      }

      try {
        const iceResp = await fetch(`${API_BASE_URL}/api/ice-config`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (iceResp.ok) {
          const fetchedConfig = await iceResp.json();
          if (fetchedConfig.iceServers) {
            fetchedConfig.iceServers = fetchedConfig.iceServers
              .map((server) => {
                if (typeof server.urls === "string") {
                  if (server.urls.startsWith("http")) return null;
                } else if (Array.isArray(server.urls)) {
                  server.urls = server.urls.filter(
                    (u) => !u.startsWith("http"),
                  );
                  if (server.urls.length === 0) return null;
                }
                return server;
              })
              .filter(Boolean);

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
      }
    };
  }

  if (shareScreenBtn) shareScreenBtn.onclick = startScreenShare;
  if (stopShareBtn) stopShareBtn.onclick = stopScreenShare;
  if (leaveBtn) leaveBtn.onclick = () => window.location.reload();

  if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;
  if (toggleVideoBtn) toggleVideoBtn.onclick = toggleVideo;
  if (toggleFullscreenBtn) toggleFullscreenBtn.onclick = toggleFullscreen;

  // Chat Listeners
  if (toggleChatBtn) toggleChatBtn.onclick = toggleChat;
  if (closeChatBtn) closeChatBtn.onclick = toggleChat;
  if (chatForm) {
    chatForm.onsubmit = (e) => {
      e.preventDefault();
      sendChatMessage();
    };
  }

  document.addEventListener("fullscreenchange", updateFullscreenIcon);

  // Monitor PIP Exit to ensure state is clean
  if (mainVideo) {
    mainVideo.addEventListener("leavepictureinpicture", () => {
      Logger.info("Main Video left PIP");
    });
  }
  if (remoteVideoOverlay) {
    remoteVideoOverlay.addEventListener("leavepictureinpicture", () => {
      Logger.info("Overlay Video left PIP");
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
        Logger.error(
          `Error attempting to enable fullscreen: ${err.message} (${err.name})`,
        );
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
      // Build Audio Constraints
      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (selectedAudioInputId) {
        audioConstraints.deviceId = { exact: selectedAudioInputId };
      }

      // 1. Try Audio + Video
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: audioConstraints,
        });
      } catch (avErr) {
        Logger.warn("Could not get Audio+Video, trying Audio only...", avErr);
        // 2. Try Audio Only
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: audioConstraints,
          });
          showToast("Camera access denied/failed. Joining with Audio only.");
        } catch (aErr) {
          Logger.warn("Could not get Audio, joining as receive-only...", aErr);
          // 3. Fallback: No Media (Receive Only)
          localStream = new MediaStream();
          showToast(
            "Microphone access denied/failed. Joining as receive-only.",
          );
        }
      }

      // If we have video, show it
      if (localStream.getVideoTracks().length > 0) {
        mainVideo.srcObject = localStream;
        mainVideo.muted = true;
        mainVideo.classList.add("mirror");

        localVideo.srcObject = localStream; // Also set local preview
        localVideoContainer.classList.add("hidden"); // Hide PIP initially (alone in room)
      } else {
        // No video: Hide local preview
        localVideoContainer.classList.add("hidden");
      }

      // If we have no audio, update UI buttons
      if (localStream.getAudioTracks().length === 0) {
        toggleMicBtn.disabled = true;
        toggleMicBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      if (localStream.getVideoTracks().length === 0) {
        toggleVideoBtn.disabled = true;
        toggleVideoBtn.classList.add("opacity-50", "cursor-not-allowed");
      }

      Logger.info("Local media stream acquired (or initialized empty)");
      connectSocket();
    } catch (err) {
      alert("Unexpected error starting call: " + err.message);
      Logger.error("Critical error in startCall", err);
    }
  }

  function connectSocket() {
    // Determine WS Protocol based on API_BASE_URL
    let wsProtocol = "ws:";
    let host = window.location.host; // Default fallback

    if (API_BASE_URL.startsWith("http")) {
      // Use the configured API URL to determine host and protocol
      const urlObj = new URL(API_BASE_URL);
      wsProtocol = urlObj.protocol === "https:" ? "wss:" : "ws:";
      host = urlObj.host;
    } else {
      // Fallback for relative paths
      wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    }

    socket = new WebSocket(
      `${wsProtocol}//${host}/ws/${roomId}?token=${authToken}`,
    );

    socket.onopen = () => {
      Logger.success("WebSocket connected");
      // Small delay to ensure everything is ready
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
        Logger.error("WebSocket closed with error:", event.reason);
        window.location.reload();
      } else {
        Logger.warn("WebSocket disconnected, retrying...");
        setTimeout(connectSocket, 3000);
      }
    };
  }

  async function createPeerConnection() {
    peerConnection = new RTCPeerConnection(rtcConfig);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    peerConnection.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);

      if (!remoteStream) {
        // First stream is considered the primary Camera stream
        remoteStream = stream;
        switchToConnectedView();
      } else if (remoteStream.id !== stream.id) {
        // Second stream is the Screen Share
        remoteScreenStream = stream;

        // Show Screen Share in Main Video
        mainVideo.srcObject = remoteScreenStream;
        mainVideo.classList.remove("mirror");

        // Handle Shared Volume Control
        previousMainVolume = mainVideo.volume; // Save current volume (likely 1 or user set)
        sharedVolumeContainer.classList.remove("hidden");
        sharedVolumeSlider.value = previousMainVolume;

        // Move Remote Camera to Overlay
        remoteVideoOverlay.srcObject = remoteStream;
        remoteVideoOverlay.muted = false; // Ensure audio is enabled if track has it (though usually mixed)
        remoteOverlayContainer.classList.remove("hidden");

        // Ensure overlay plays audio/video
        remoteVideoOverlay
          .play()
          .catch((e) => Logger.error("Error playing overlay video", e));

        // Handle Stream Removal (Stop Share)
        stream.onremovetrack = () => {
          remoteScreenStream = null;
          // Revert Main Video to Remote Camera
          mainVideo.srcObject = remoteStream;

          // Restore Volume and Hide Control
          sharedVolumeContainer.classList.add("hidden");
          mainVideo.volume = previousMainVolume;

          remoteVideoOverlay.srcObject = null;
          remoteOverlayContainer.classList.add("hidden");
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
      // Debounce negotiation to prevent multiple offers (e.g. when adding screen video + audio)
      if (peerConnection._negotiationTimer) {
        clearTimeout(peerConnection._negotiationTimer);
      }

      peerConnection._negotiationTimer = setTimeout(async () => {
        Logger.info("Negotiation needed triggered (Debounced)");
        if (peerConnection.signalingState !== "stable") {
          Logger.info(
            `Signaling state is '${peerConnection.signalingState}', skipping auto-offer`,
          );
          return;
          
        }
        try {
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          sendSignal({ type: "offer", sdp: offer });
        } catch (err) {
          Logger.error("Error during negotiation:", err);
        }
      }, 500); // Wait 500ms for all tracks to be added
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

    if (mainVideo.paused) {
      mainVideo.play().catch((e) => {});
    }

    applyAudioOutputDevice(selectedAudioOutputId);

    updateRemoteVideoUI();
    updateRemoteAudioUI();
  }

  async function handleSignalMessage(msg) {
    if (
      !peerConnection &&
      msg.type !== "mic-status" &&
      msg.type !== "chat" &&
      msg.type !== "welcome"
    )
      await createPeerConnection();

    switch (msg.type) {
      case "announce":
        showToast(`${msg.name} has joined!`);
        remoteLabel.innerText = msg.name || "Remote";
        if (remoteOverlayLabel)
          remoteOverlayLabel.innerText = msg.name || "Remote";
        // Reply with our name after a short delay
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
          if (peerConnection.signalingState !== "stable") {
            Logger.warn(
              "Received Offer while not stable (Glare). State:",
              peerConnection.signalingState,
            );
            // Simple glare handling: if we are the "polite" peer (receiver), we accept.
            // But here we just try to proceed, letting WebRTC handle rollback if needed.
            // Ideally, we should ignore if we are the impolite peer, but for now just log.
          }
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg.sdp),
          );
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
          if (peerConnection.signalingState !== "have-local-offer") {
            Logger.warn(
              "Received Answer in wrong state:",
              peerConnection.signalingState,
            );
            return;
          }
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg.sdp),
          );
          processIceQueue();
        } catch (err) {
          Logger.error("Error handling Answer:", err);
        }
        break;

      case "ice-candidate":
        if (peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(
              new RTCIceCandidate(msg.candidate),
            );
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
        if (!isChatOpen) {
          chatBadge.classList.remove("hidden");
        }
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

    // Clear chat
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
    remoteOverlayMuteIndicator.classList.add("hidden");
    remoteOverlayVideoOffIndicator.classList.add("hidden");

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
    toast.className =
      "bg-blue-600 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-500 opacity-0";
    toast.innerText = message;
    toastContainer.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove("opacity-0"));

    setTimeout(() => {
      toast.classList.add("opacity-0");
      setTimeout(() => toast.remove(), 500);
    }, 3000);

    // Also add to chat
    appendChatMessage(message, "system");
  }

  function toggleMic() {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        const isEnabled = audioTrack.enabled;

        if (isEnabled) {
          // Unmuted (Gray/Default)
          toggleMicBtn.classList.remove("bg-red-600", "hover:bg-red-700");
          toggleMicBtn.classList.add("hover:bg-gray-600");
          
          iconMicOn.classList.remove("hidden");
          iconMicOff.classList.add("hidden");
          localMuteIndicator.classList.add("hidden");
        } else {
          // Muted (Red)
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
          toggleVideoBtn.classList.replace(
            "hover:bg-red-700",
            "hover:bg-gray-600",
          );
          iconVideoOn.classList.remove("hidden");
          iconVideoOff.classList.add("hidden");

          localVideoOffIndicator.classList.add("hidden");

          if (remoteStream) {
            localVideoContainer.classList.remove("hidden");
          }
        } else {
          toggleVideoBtn.classList.replace("bg-gray-700", "bg-red-600");
          toggleVideoBtn.classList.replace(
            "hover:bg-gray-600",
            "hover:bg-red-700",
          );
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

  // --- Electron Integration ---
  if (window.electronAPI) {
    document.getElementById("title-bar").classList.remove("hidden");

    // Custom Minimize with PIP support
    document.getElementById("min-btn").onclick = () => {
      // With Window PiP, we just trigger PiP mode.
      enterPiP(); 
    };

    document.getElementById("max-btn").onclick = () =>
      window.electronAPI.maximizeWindow();
    document.getElementById("close-btn").onclick = () =>
      window.electronAPI.closeWindow();

    // Auto PIP on app switch (Alt+Tab or click away)
    window.electronAPI.onAppBlur(() => {
      enterPiP();
    });

    // Handle PiP Mode UI Changes
    window.electronAPI.onPipModeChanged((isPip) => {
      if (isPip) {
        document.body.classList.add("pip-mode");
        
        // Add Drag Handle
        if (!document.getElementById("pip-drag-handle")) {
            const handle = document.createElement("div");
            handle.id = "pip-drag-handle";
            handle.innerHTML = `<svg class="w-4 h-4 text-white opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path></svg>`;
            document.body.appendChild(handle);
        }

        // --- Video Visibility Logic for PiP ---
        // If we are sharing screen, the remote video is in the overlay.
        // We need to make sure THAT video is visible and full screen.
        if (isScreenSharing && remoteStream) {
            document.body.classList.add("pip-showing-overlay");
            // Ensure overlay is visible (override hidden class)
            remoteOverlayContainer.classList.remove("hidden");
        } else {
            document.body.classList.remove("pip-showing-overlay");
        }

        Logger.info("Entered Window PiP Mode");
      } else {
        document.body.classList.remove("pip-mode");
        document.body.classList.remove("pip-showing-overlay");
        
        const handle = document.getElementById("pip-drag-handle");
        if (handle) handle.remove();
        Logger.info("Exited Window PiP Mode");
      }
    });

    // Restore on Double Click (instead of single click focus)
    document.addEventListener("dblclick", () => {
        if (document.body.classList.contains("pip-mode")) {
            window.electronAPI.togglePip(false);
        }
    });
    
    /* Removed aggressive auto-restore on focus */
    /* window.electronAPI.onAppFocus(() => { ... }); */
  }

  function enterPiP() {
    Logger.info("Attempting to enter PIP...");

    if (!remoteStream) {
      Logger.info("No remote stream active, skipping PIP.");
      return;
    }

    // Electron Window PiP Strategy
    if (window.electronAPI) {
        window.electronAPI.togglePip(true);
        return;
    }

    // Standard Browser PiP Strategy
    if (!document.pictureInPictureEnabled) {
      Logger.warn("PIP not enabled/supported.");
      return;
    }

    if (document.pictureInPictureElement) {
      Logger.info("PIP already active.");
      return;
    }

    const targetVideo =
      mainVideo.srcObject && mainVideo.srcObject.id === remoteStream.id
        ? mainVideo
        : remoteVideoOverlay.srcObject &&
            remoteVideoOverlay.srcObject.id === remoteStream.id
          ? remoteVideoOverlay
          : null;

    if (!targetVideo) {
      Logger.info("Remote stream not attached to any video element.");
      return;
    }

    if (targetVideo.readyState < 1) {
      Logger.warn("Target video not ready for PIP.");
      return;
    }

    targetVideo.requestPictureInPicture().catch((e) => {
      if (e.name === "NotAllowedError") {
        Logger.warn("PIP blocked by browser (user gesture required).");
        showToast("Auto-PIP blocked. Click the Minimize button.");
      } else {
        Logger.error(`Failed to enter PIP on ${targetVideo.id}:`, e);
      }
    });
  }

  // Source Selection Elements
  const sourcesModal = document.getElementById("sources-modal");
  const closeSourcesBtn = document.getElementById("close-sources-btn");
  const sourcesList = document.getElementById("sources-list");
  const shareAudioCheck = document.getElementById("share-audio-check");
  const fpsSelect = document.getElementById("fps-select");
  const audioHelpBtn = document.getElementById("audio-help-btn");

  if (closeSourcesBtn) {
    closeSourcesBtn.onclick = () => sourcesModal.classList.add("hidden");
  }
  
  if (audioHelpBtn && window.electronAPI) {
      audioHelpBtn.onclick = () => window.electronAPI.openAudioGuide();
  }

  // --- Screen Sharing Helper Functions for Audio Loopback Prevention ---
  let audioOutputBeforeScreenShare = null;
  let isAudioReroutedForScreenShare = false;

  // Create a silent/dummy audio output to prevent echo
  async function rerouteAudioForScreenShare() {
    if (isAudioReroutedForScreenShare) return;
    
    try {
      // Save current output device
      audioOutputBeforeScreenShare = selectedAudioOutputId;
      
      // Get available audio devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      
      // Check if we have multiple output devices
      if (outputs.length > 1) {
        // Inform user about the limitation
        showToast(
          "⚠️ Screen audio enabled: Remote audio will use your default output to prevent echo. " +
          "For best experience, use headphones or enable 'Stereo Mix' loopback."
        );
      } else {
        // Only one output available - user MUST use headphones
        showToast(
          "⚠️ Please use HEADPHONES when sharing screen with audio, " +
          "otherwise the remote user will hear themselves echo."
        );
      }
      
      isAudioReroutedForScreenShare = true;
      Logger.info("Audio routing prepared for screen share");
      
    } catch (e) {
      Logger.error("Failed to prepare audio routing", e);
      showToast(
        "⚠️ IMPORTANT: Use headphones to prevent the remote user from hearing echo!"
      );
    }
  }

  // Restore original audio routing
  async function restoreAudioRouting() {
    if (!isAudioReroutedForScreenShare) return;
    
    try {
      if (audioOutputBeforeScreenShare) {
        await applyAudioOutputDevice(audioOutputBeforeScreenShare);
        selectedAudioOutputId = audioOutputBeforeScreenShare;
      }
      
      isAudioReroutedForScreenShare = false;
      audioOutputBeforeScreenShare = null;
      Logger.info("Audio routing restored");
      
    } catch (e) {
      Logger.error("Failed to restore audio routing", e);
    }
  }

  // --- Naudiodon Audio Capture State ---
  let systemAudioContext;
  let systemAudioDestination;
  let nextAudioStartTime = 0;
  let isCapturingSystemAudio = false;

  const systemAudioSelect = document.getElementById("system-audio-device-select");

  async function startScreenShare() {
    // 1. Electron: Use Custom Source Selector
    if (window.electronAPI) {
      try {
        const sources = await window.electronAPI.getScreenSources();
        populateSourcesList(sources);
        
        // Populate Audio Devices (Standard Web API)
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
            } catch (e) {
                Logger.error("Failed to list audio devices", e);
            }
        }
        
        sourcesModal.classList.remove("hidden");
      } catch (err) {
        Logger.error("Failed to get sources from Electron:", err);
        showToast("Failed to load screen sources.");
      }
      return;
    }

    // 2. Web Browser: Standard getDisplayMedia
    const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

    if (isFirefox) {
      showToast(
        "Firefox may not support sharing system audio. Use Chrome/Edge/Brave if audio is needed.",
      );
    }

    try {
      Logger.info("Requesting screen share (Web)...");

      currentScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Check if audio was included
      const hasAudio = currentScreenStream.getAudioTracks().length > 0;
      if (hasAudio) {
        await rerouteAudioForScreenShare();
        
        // Show persistent reminder
        const reminder = document.createElement('div');
        reminder.id = 'headphone-reminder';
        reminder.className = 'fixed top-20 left-1/2 transform -translate-x-1/2 bg-yellow-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3';
        reminder.innerHTML = `
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <span><strong>Using headphones?</strong> Great! Otherwise remote user will hear echo.</span>
          <button onclick="this.parentElement.remove()" class="ml-2 text-white hover:text-gray-200">✕</button>
        `;
        document.body.appendChild(reminder);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
          const el = document.getElementById('headphone-reminder');
          if (el) el.remove();
        }, 10000);
      }

      handleScreenStreamAcquired();
    } catch (err) {
      Logger.error("Error starting screen share:", err);
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
      // If sharing audio via standard method, prepare audio routing
      if (shareAudio && !customAudioDeviceId) {
        await rerouteAudioForScreenShare();
      }

      // Acquisition with Legacy Chrome Constraints
      const constraints = {
        audio: (shareAudio && !customAudioDeviceId)
          ? {
              mandatory: {
                chromeMediaSource: "desktop",
                chromeMediaSourceId: sourceId,
              },
            }
          : false,
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

      // --- CUSTOM AUDIO HANDLING (Standard Web API) ---
      if (customAudioDeviceId) {
          Logger.info("Using custom audio device for share:", customAudioDeviceId);
          
          try {
              const audioStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                      deviceId: { exact: customAudioDeviceId },
                      echoCancellation: false, // Usually false for music/game audio
                      autoGainControl: false,
                      noiseSuppression: false
                  }
              });
              
              const audioTrack = audioStream.getAudioTracks()[0];
              if (audioTrack) {
                  currentScreenStream.addTrack(audioTrack);
                  Logger.info("Added custom audio track to screen stream");
              }
          } catch (audioErr) {
              Logger.error("Failed to acquire custom audio device", audioErr);
              showToast("Failed to capture selected audio device.");
          }
      } else {
          // Standard Audio Constraints
          const audioTrack = currentScreenStream.getAudioTracks()[0];
          if (audioTrack) {
            try {
              await audioTrack.applyConstraints({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
              });
            } catch (e) {
              Logger.warn("Could not apply audio constraints", e);
            }
          }
      }

      handleScreenStreamAcquired();
      
    } catch (err) {
      Logger.error("Error selecting source:", err);
      showToast("Failed to share selected screen.");
      
      if (shareAudio) {
        await restoreAudioRouting();
      }
    }
  }

  function handleScreenStreamAcquired() {
    currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];
    const screenAudioTrack = currentScreenStream.getAudioTracks()[0];

    if (screenAudioTrack) {
      Logger.info("Screen audio track detected");
    } else {
      Logger.warn("No screen audio track detected");
    }

    if (peerConnection) {
      // Add Screen Video Track
      currentScreenSender = peerConnection.addTrack(
        currentScreenVideoTrack,
        currentScreenStream,
      );

      // Add Screen Audio Track separately
      if (screenAudioTrack) {
        currentScreenAudioSender = peerConnection.addTrack(
          screenAudioTrack,
          currentScreenStream,
        );
      }
    }

    updateUIForScreenShare(true);
    currentScreenVideoTrack.onended = () => stopScreenShare();
    isScreenSharing = true;
    Logger.info("Screen sharing started");
    sendSignal({ type: "screen-share-status", isSharing: true });
  }

  async function stopScreenShare() {
    if (!isScreenSharing) return;

    if (peerConnection) {
      // Remove Screen Video Track
      if (currentScreenSender) {
        peerConnection.removeTrack(currentScreenSender);
        currentScreenSender = null;
      }

      // Remove Screen Audio Track
      if (currentScreenAudioSender) {
        peerConnection.removeTrack(currentScreenAudioSender);
        currentScreenAudioSender = null;
      }
    }

    if (currentScreenStream) {
      currentScreenStream.getTracks().forEach((track) => track.stop());
      currentScreenStream = null;
    }

    // Restore audio routing
    await restoreAudioRouting();

    updateUIForScreenShare(false);

    if (document.pictureInPictureElement)
      document.exitPictureInPicture().catch((e) => {});
    isScreenSharing = false;
    sendSignal({ type: "screen-share-status", isSharing: false });
  }

  function updateUIForScreenShare(isSharing) {
    if (isSharing) {
      mainVideo.style.display = "none";
      mainVideo.muted = true;

      screenSharePlaceholder.classList.remove("hidden");
      screenSharePlaceholder.style.display = "flex";

      remoteOverlayContainer.classList.remove("hidden");
      if (remoteStream) {
        remoteVideoOverlay.srcObject = remoteStream;
        remoteVideoOverlay.muted = false;

        // Auto-PiP for Overlay (Browser Native Only)
        // If Electron is active, we DO NOT trigger this because we use Window PiP
        if (
          !window.electronAPI && 
          document.pictureInPictureEnabled &&
          remoteVideoOverlay.requestPictureInPicture
        ) {
          if (remoteVideoOverlay.readyState >= 1) {
            remoteVideoOverlay.requestPictureInPicture().catch((e) => {});
          } else {
            remoteVideoOverlay.onloadedmetadata = () => {
              remoteVideoOverlay.requestPictureInPicture().catch((e) => {});
              remoteVideoOverlay.onloadedmetadata = null;
            };
          }
        }
      }

      showToast(
        "You are sharing your screen. Minimize this window to avoid the mirror effect.",
      );

      shareScreenBtn.classList.replace("bg-blue-600", "bg-green-600");
      shareScreenBtn.classList.replace(
        "hover:bg-blue-700",
        "hover:bg-green-700",
      );
      shareScreenBtn.title = "Change Window";
      stopShareBtn.classList.remove("hidden");
    } else {
      mainVideo.style.display = "block";

      if (remoteStream && mainVideo.srcObject === remoteStream) {
        mainVideo.muted = false;
      } else {
        mainVideo.muted = true;
      }

      screenSharePlaceholder.classList.add("hidden");
      screenSharePlaceholder.style.display = "none";

      remoteOverlayContainer.classList.add("hidden");
      remoteVideoOverlay.srcObject = null;
      remoteVideoOverlay.muted = true;

      if (remoteStream) mainVideo.srcObject = remoteStream;

      shareScreenBtn.classList.replace("bg-green-600", "bg-blue-600");
      shareScreenBtn.classList.replace(
        "hover:bg-green-700",
        "hover:bg-blue-700",
      );
      shareScreenBtn.title = "Share Screen";
      stopShareBtn.classList.add("hidden");
    }

    updateRemoteVideoUI();
    updateRemoteAudioUI();
  }

  function setupDraggable(element) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    element.onmousedown = dragMouseDown;
    element.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      // Don't drag if we are clicking on the resize handle area (bottom right corner)
      const rect = element.getBoundingClientRect();
      const isResizeHandle =
        e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20;

      if (isResizeHandle) return;

      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
      const touch = e.touches[0];
      const rect = element.getBoundingClientRect();
      const isResizeHandle =
        touch.clientX > rect.right - 30 && touch.clientY > rect.bottom - 30;

      if (isResizeHandle) return;

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
          e.stopPropagation(); // Prevent drag triggering
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

    // Check where the remote stream is displayed
    const isRemoteInMain =
      mainVideo.srcObject && mainVideo.srcObject.id === remoteStream.id;
    const isRemoteInOverlay =
      remoteVideoOverlay.srcObject &&
      remoteVideoOverlay.srcObject.id === remoteStream.id;

    if (isRemoteInMain) {
      if (isRemoteVideoEnabled) {
        mainVideoOffIndicator.classList.add("hidden");
      } else {
        mainVideoOffIndicator.classList.remove("hidden");
      }
      // Ensure overlay indicator is hidden if not there
      remoteOverlayVideoOffIndicator.classList.add("hidden");
    } else if (isRemoteInOverlay) {
      if (isRemoteVideoEnabled) {
        remoteOverlayVideoOffIndicator.classList.add("hidden");
      } else {
        remoteOverlayVideoOffIndicator.classList.remove("hidden");
      }
      // Ensure main indicator is hidden if not there
      mainVideoOffIndicator.classList.add("hidden");
    } else {
      // Remote stream not visible? Hide both
      mainVideoOffIndicator.classList.add("hidden");
      remoteOverlayVideoOffIndicator.classList.add("hidden");
    }
  }

  function updateRemoteAudioUI() {
    if (!remoteStream) return;

    const isRemoteInMain =
      mainVideo.srcObject && mainVideo.srcObject.id === remoteStream.id;
    const isRemoteInOverlay =
      remoteVideoOverlay.srcObject &&
      remoteVideoOverlay.srcObject.id === remoteStream.id;

    // Mute indicator shows when Audio is DISABLED (muted)
    const showIndicator = !isRemoteAudioEnabled;

    if (isRemoteInMain) {
      if (showIndicator) {
        mainVideoMuteIndicator.classList.remove("hidden");
      } else {
        mainVideoMuteIndicator.classList.add("hidden");
      }
      remoteOverlayMuteIndicator.classList.add("hidden");
    } else if (isRemoteInOverlay) {
      if (showIndicator) {
        remoteOverlayMuteIndicator.classList.remove("hidden");
      } else {
        remoteOverlayMuteIndicator.classList.add("hidden");
      }
      mainVideoMuteIndicator.classList.add("hidden");
    } else {
      mainVideoMuteIndicator.classList.add("hidden");
      remoteOverlayMuteIndicator.classList.add("hidden");
    }
  }

  // Inject PiP Styles
  const pipStyle = document.createElement('style');
  pipStyle.textContent = `
    body.pip-mode #title-bar,
    body.pip-mode header,
    body.pip-mode #controls-bar,
    body.pip-mode #chat-sidebar,
    body.pip-mode #local-video-container,
    body.pip-mode #remote-overlay-container,
    body.pip-mode #join-screen,
    body.pip-mode #boot-screen,
    body.pip-mode #screen-share-placeholder,
    body.pip-mode .source-item,
    body.pip-mode #sources-modal {
        display: none !important;
    }
    
    body.pip-mode {
        background: black !important;
    }

    body.pip-mode #video-screen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 9999 !important;
        margin: 0 !important;
        padding: 0 !important;
    }
    
    body.pip-mode #video-container {
        width: 100% !important;
        height: 100% !important;
    }
    
    body.pip-mode #main-video {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important; /* Keep aspect ratio */
    }

    /* PiP Drag Handle */
    #pip-drag-handle {
        position: fixed;
        top: 0;
        left: 50%;
        transform: translateX(-50%);
        width: 100px;
        height: 24px;
        background: rgba(0, 0, 0, 0.6);
        border-bottom-left-radius: 8px;
        border-bottom-right-radius: 8px;
        z-index: 10000;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: move;
        -webkit-app-region: drag; /* This makes it draggable */
    }
    
    /* Ensure nothing else steals the drag, allowing edge resizing */
    body.pip-mode * {
        -webkit-app-region: no-drag;
    }
    
    /* Re-enable drag for the handle */
    body.pip-mode #pip-drag-handle, 
    body.pip-mode #pip-drag-handle svg {
        -webkit-app-region: drag;
    }

    /* --- SPECIAL HANDLING FOR OVERLAY VIDEO IN PiP --- */
    /* When 'pip-showing-overlay' is active, we hide the main placeholder and maximize the overlay */
    
    body.pip-mode.pip-showing-overlay #screen-share-placeholder {
        display: none !important;
    }

    body.pip-mode.pip-showing-overlay #remote-overlay-container {
        display: block !important;
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 9998 !important; /* Below drag handle */
        border: none !important;
        border-radius: 0 !important;
        background: black !important;
    }

    body.pip-mode.pip-showing-overlay #remote-video-overlay {
        width: 100% !important;
        height: 100% !important;
        object-fit: contain !important;
    }
    
    /* Hide the mini-headers/controls on the overlay in PiP */
    body.pip-mode.pip-showing-overlay #remote-overlay-container .pip-header,
    body.pip-mode.pip-showing-overlay #remote-overlay-container .minimize-btn,
    body.pip-mode.pip-showing-overlay #remote-overlay-container #remote-overlay-label {
        display: none !important;
    }
  `;
  document.head.appendChild(pipStyle);

});
