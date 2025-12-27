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
  const mainVideoMuteIndicator = document.getElementById("main-video-mute-indicator");
  const mainVideoOffIndicator = document.getElementById("main-video-off-indicator");
  const localVideoOffIndicator = document.getElementById("local-video-off-indicator");
  
  const remoteOverlayVideoOffIndicator = document.getElementById("remote-overlay-video-off-indicator");
  const remoteOverlayMuteIndicator = document.getElementById("remote-overlay-mute-indicator");

  // Remote State
  let isRemoteVideoEnabled = true;
  let isRemoteAudioEnabled = true;

  const localLabel = document.getElementById("local-label");
  const remoteLabel = document.getElementById("remote-label");
  const remoteLabelContainer = document.getElementById(
    "remote-label-container",
  );

  const sharedVolumeContainer = document.getElementById("shared-volume-container");
  const sharedVolumeSlider = document.getElementById("shared-volume-slider");
  let previousMainVolume = 1;

  const shareScreenBtn = document.getElementById("share-screen");
  const stopShareBtn = document.getElementById("stop-share");
  const leaveBtn = document.getElementById("leave-btn");
  const toggleMicBtn = document.getElementById("toggle-mic");
  const toggleVideoBtn = document.getElementById("toggle-video");
  const toggleFullscreenBtn = document.getElementById("toggle-fullscreen");

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

  let isChatOpen = false;

  // Fetch Client Config (Logging, etc.)
  fetch("/api/config")
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

      userName = name || "User-" + Math.floor(Math.random() * 1000);

      if (!roomId || !password) {
        alert("Please enter both Room ID and Password");
        return;
      }

      try {
        const iceResp = await fetch("/api/ice-config");
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

        const response = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      }
  }

  document.addEventListener("fullscreenchange", updateFullscreenIcon);

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
          container.requestFullscreen().catch(err => {
              Logger.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
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
      // 1. Try Audio + Video
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
      } catch (avErr) {
        Logger.warn("Could not get Audio+Video, trying Audio only...", avErr);
        // 2. Try Audio Only
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: false,
            audio: true,
          });
          showToast("Camera access denied/failed. Joining with Audio only.");
        } catch (aErr) {
          Logger.warn("Could not get Audio, joining as receive-only...", aErr);
          // 3. Fallback: No Media (Receive Only)
          localStream = new MediaStream();
          showToast("Microphone access denied/failed. Joining as receive-only.");
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
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/${roomId}?token=${authToken}`,
    );

    socket.onopen = () => {
      Logger.success("WebSocket connected");
      sendSignal({ type: "announce", name: userName });
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

    peerConnection.onnegotiationneeded = async () => {
      try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: "offer", sdp: offer });
      } catch (err) {}
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
    
    updateRemoteVideoUI();
    updateRemoteAudioUI();
  }

  async function handleSignalMessage(msg) {
    if (!peerConnection && msg.type !== "mic-status" && msg.type !== "chat")
      await createPeerConnection();

    switch (msg.type) {
      case "announce":
        showToast(`${msg.name} has joined!`);
        remoteLabel.innerText = msg.name || "Remote";

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: "offer", sdp: offer });
        break;

      case "offer":
        try {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg.sdp),
          );
          processIceQueue();

          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          sendSignal({ type: "answer", sdp: answer });
        } catch (err) {}
        break;

      case "answer":
        try {
          await peerConnection.setRemoteDescription(
            new RTCSessionDescription(msg.sdp),
          );
          processIceQueue();
        } catch (err) {}
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
          toggleMicBtn.classList.replace("bg-red-600", "bg-gray-700");
          toggleMicBtn.classList.replace(
            "hover:bg-red-700",
            "hover:bg-gray-600",
          );
          iconMicOn.classList.remove("hidden");
          iconMicOff.classList.add("hidden");
          localMuteIndicator.classList.add("hidden");
        } else {
          toggleMicBtn.classList.replace("bg-gray-700", "bg-red-600");
          toggleMicBtn.classList.replace(
            "hover:bg-gray-600",
            "hover:bg-red-700",
          );
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

  async function startScreenShare() {
    // Detect Firefox/Gecko

    const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;

    if (isFirefox) {
      showToast(
        "Firefox may not support sharing system audio. Use Chrome/Edge/Brave if audio is needed.",
      );
    }

    try {
      Logger.info("Requesting screen share...");

      // Use more standard constraints. Chrome handles system audio best with echoCancellation disabled.

      currentScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
        },

        audio: {
          echoCancellation: false,

          noiseSuppression: false,

          autoGainControl: false,
        },
      });

      currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];

      const screenAudioTrack = currentScreenStream.getAudioTracks()[0];

      if (screenAudioTrack) {
        Logger.info("Screen audio track detected");
      } else {
        Logger.warn("No screen audio track detected");

        if (!isFirefox) {
          showToast(
            "System audio not captured. Did you check 'Share system audio'?",
          );
        }
      }

      if (peerConnection) {
        // Add Screen Video Track (send as a separate stream)
        currentScreenSender = peerConnection.addTrack(
          currentScreenVideoTrack,
          currentScreenStream,
        );

        // Add Screen Audio Track (if available) to the SAME stream
        if (screenAudioTrack) {
            currentScreenAudioSender = peerConnection.addTrack(
                screenAudioTrack,
                currentScreenStream
            );
            Logger.info("Added screen audio track separately");
        }
      }

      updateUIForScreenShare(true);
      currentScreenVideoTrack.onended = () => stopScreenShare();
      isScreenSharing = true;
      Logger.info("Screen sharing started");
      sendSignal({ type: "screen-share-status", isSharing: true });
    } catch (err) {
      Logger.error("Error starting screen share:", err);
    }
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

        if (
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
      const isResizeHandle = (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20);
      
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
      const isResizeHandle = (touch.clientX > rect.right - 30 && touch.clientY > rect.bottom - 30);
      
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
    
    containers.forEach(container => {
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
    const isRemoteInMain = (mainVideo.srcObject && mainVideo.srcObject.id === remoteStream.id);
    const isRemoteInOverlay = (remoteVideoOverlay.srcObject && remoteVideoOverlay.srcObject.id === remoteStream.id);

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

    const isRemoteInMain = (mainVideo.srcObject && mainVideo.srcObject.id === remoteStream.id);
    const isRemoteInOverlay = (remoteVideoOverlay.srcObject && remoteVideoOverlay.srcObject.id === remoteStream.id);

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
});