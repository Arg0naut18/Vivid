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

  let audioContext;
  let audioDestination;
  let micSource;
  let screenAudioSource;

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
  const remoteMuteIndicator = document.getElementById("remote-mute-indicator");

  const localLabel = document.getElementById("local-label");
  const remoteLabel = document.getElementById("remote-label");
  const remoteLabelContainer = document.getElementById(
    "remote-label-container",
  );

  const shareScreenBtn = document.getElementById("share-screen");
  const stopShareBtn = document.getElementById("stop-share");
  const leaveBtn = document.getElementById("leave-btn");
  const toggleMicBtn = document.getElementById("toggle-mic");
  const toggleVideoBtn = document.getElementById("toggle-video");

  const iconMicOn = document.getElementById("icon-mic-on");
  const iconMicOff = document.getElementById("icon-mic-off");
  const iconVideoOn = document.getElementById("icon-video-on");
  const iconVideoOff = document.getElementById("icon-video-off");

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
          return;
        }

        const data = await response.json();
        authToken = data.access_token;

        joinScreen.classList.add("hidden");
        videoScreen.classList.remove("hidden");
        roomInfo.classList.remove("hidden");
        roomIdDisplay.innerText = roomId;
        localLabel.innerText = userName + " (You)";

        await startCall();
      } catch (err) {
        alert("Could not connect to server");
      }
    };
  }

  if (shareScreenBtn) shareScreenBtn.onclick = startScreenShare;
  if (stopShareBtn) stopShareBtn.onclick = stopScreenShare;
  if (leaveBtn) leaveBtn.onclick = () => window.location.reload();

  if (toggleMicBtn) toggleMicBtn.onclick = toggleMic;
  if (toggleVideoBtn) toggleVideoBtn.onclick = toggleVideo;

  if (localVideoContainer) setupDraggable(localVideoContainer);
  if (remoteOverlayContainer) setupDraggable(remoteOverlayContainer);

  async function startCall() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      mainVideo.srcObject = localStream;
      mainVideo.muted = true;
      mainVideo.classList.add("mirror");

      localVideoContainer.classList.add("hidden");
      remoteLabelContainer.classList.add("hidden");

      connectSocket();
    } catch (err) {
      alert("Could not access camera/microphone");
    }
  }

  function connectSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(
      `${protocol}//${window.location.host}/ws/${roomId}?token=${authToken}`,
    );

    socket.onopen = () => {
      sendSignal({ type: "announce", name: userName });
    };

    socket.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      handleSignalMessage(msg);
    };

    socket.onclose = (event) => {
      if (event.code === 1008 || event.code === 403) {
        alert("Connection closed: " + event.reason);
        window.location.reload();
      } else {
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

        // Move Remote Camera to Overlay
        remoteVideoOverlay.srcObject = remoteStream;
        remoteVideoOverlay.muted = false; // Ensure audio is enabled if track has it (though usually mixed)
        remoteOverlayContainer.classList.remove("hidden");

        // Handle Stream Removal (Stop Share)
        stream.onremovetrack = () => {
          remoteScreenStream = null;
          // Revert Main Video to Remote Camera
          mainVideo.srcObject = remoteStream;
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
  }

  async function handleSignalMessage(msg) {
    if (!peerConnection && msg.type !== "mic-status")
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
        if (msg.enabled) {
          remoteMuteIndicator.classList.add("hidden");
        } else {
          remoteMuteIndicator.classList.remove("hidden");
        }
        break;

      case "screen-share-status":
        if (msg.isSharing) {
          showToast("Remote user is sharing their screen");
          mainVideo.classList.remove("mirror");
        } else {
          showToast("Remote user stopped sharing screen");
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
  }

  function switchToWaitingView() {
    mainVideo.srcObject = localStream;
    mainVideo.muted = true;
    mainVideo.classList.add("mirror");

    localVideoContainer.classList.add("hidden");
    remoteLabelContainer.classList.add("hidden");

    remoteMuteIndicator.classList.add("hidden");
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
        } else {
          toggleVideoBtn.classList.replace("bg-gray-700", "bg-red-600");
          toggleVideoBtn.classList.replace(
            "hover:bg-gray-600",
            "hover:bg-red-700",
          );
          iconVideoOn.classList.add("hidden");
          iconVideoOff.classList.remove("hidden");
        }
      }
    }
  }

  async function startScreenShare() {
    try {
      currentScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];
      const screenAudioTrack = currentScreenStream.getAudioTracks()[0];

      if (!audioContext)
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioDestination = audioContext.createMediaStreamDestination();

      if (!micSource && localStream.getAudioTracks().length > 0)
        micSource = audioContext.createMediaStreamSource(localStream);
      if (micSource) micSource.connect(audioDestination);

      if (screenAudioTrack) {
        if (screenAudioSource) screenAudioSource.disconnect();
        screenAudioSource =
          audioContext.createMediaStreamSource(currentScreenStream);
        screenAudioSource.connect(audioDestination);
      }

      const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];

      if (peerConnection) {
        // Add Screen Video Track (send as a separate stream)
        currentScreenSender = peerConnection.addTrack(
          currentScreenVideoTrack,
          currentScreenStream,
        );

        // Replace Audio Track (send mixed audio on the primary audio sender)
        const audioSender = peerConnection
          .getSenders()
          .find((s) => s.track && s.track.kind === "audio");
        if (audioSender) await audioSender.replaceTrack(mixedAudioTrack);
      }

      updateUIForScreenShare(true);
      currentScreenVideoTrack.onended = () => stopScreenShare();
      isScreenSharing = true;
      sendSignal({ type: "screen-share-status", isSharing: true });
    } catch (err) {}
  }

  async function stopScreenShare() {
    if (!isScreenSharing) return;

    if (peerConnection) {
      // Remove Screen Video Track
      if (currentScreenSender) {
        peerConnection.removeTrack(currentScreenSender);
        currentScreenSender = null;
      }

      // Restore Audio Track
      const audioSender = peerConnection
        .getSenders()
        .find((s) => s.track && s.track.kind === "audio");
      const localAudioTrack = localStream.getAudioTracks()[0];
      if (audioSender) await audioSender.replaceTrack(localAudioTrack);
    }

    if (screenAudioSource) screenAudioSource.disconnect();
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
      
      showToast("You are sharing your screen. Minimize this window to avoid the mirror effect.");

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
  }

  function setupDraggable(element) {
    let pos1 = 0,
      pos2 = 0,
      pos3 = 0,
      pos4 = 0;

    element.onmousedown = dragMouseDown;
    element.ontouchstart = dragTouchStart;

    function dragMouseDown(e) {
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    }

    function dragTouchStart(e) {
      const touch = e.touches[0];
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
});
