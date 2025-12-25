let localStream;
let remoteStream;
let peerConnection;
let socket;
let roomId;
let authToken;
let userName = "Guest";
let isScreenSharing = false;

// Screen Share State
let currentScreenStream; 
let currentScreenVideoTrack; 

// Audio Context for Mixing
let audioContext;
let audioDestination;
let micSource;
let screenAudioSource;

// ICE Queue
let iceCandidatesQueue = [];

// ICE Servers (STUN)
const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// HTML Elements
const joinScreen = document.getElementById('join-screen');
const videoScreen = document.getElementById('video-screen');
const joinBtn = document.getElementById('join-btn');
const roomIdInput = document.getElementById('room-id');
const roomPasswordInput = document.getElementById('room-password');
const userNameInput = document.getElementById('user-name');
const roomIdDisplay = document.getElementById('room-id-display');
const roomInfo = document.getElementById('room-info');
const toastContainer = document.getElementById('toast-container');

// Video Elements
const mainVideo = document.getElementById('main-video'); 
const localVideo = document.getElementById('local-video'); 
const remoteVideoOverlay = document.getElementById('remote-video-overlay'); 

const localVideoContainer = document.getElementById('local-video-container');
const remoteOverlayContainer = document.getElementById('remote-overlay-container');
const screenSharePlaceholder = document.getElementById('screen-share-placeholder');

const localMuteIndicator = document.getElementById('local-mute-indicator');
const remoteMuteIndicator = document.getElementById('remote-mute-indicator');

const localLabel = document.getElementById('local-label');
const remoteLabel = document.getElementById('remote-label');
const remoteLabelContainer = document.getElementById('remote-label-container');

// Buttons
const shareScreenBtn = document.getElementById('share-screen');
const stopShareBtn = document.getElementById('stop-share');
const leaveBtn = document.getElementById('leave-btn');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleVideoBtn = document.getElementById('toggle-video');

// Icons
const iconMicOn = document.getElementById('icon-mic-on');
const iconMicOff = document.getElementById('icon-mic-off');
const iconVideoOn = document.getElementById('icon-video-on');
const iconVideoOff = document.getElementById('icon-video-off');

// --- Event Listeners ---

joinBtn.onclick = async () => {
    roomId = roomIdInput.value.trim();
    const password = roomPasswordInput.value.trim();
    const name = userNameInput.value.trim();
    
    if (name) userName = name;
    else userName = "User-" + Math.floor(Math.random() * 1000);

    if (!roomId || !password) {
        alert("Please enter both Room ID and Password");
        return;
    }
    
    try {
        const response = await fetch('/api/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ room_id: roomId, password: password })
        });

        if (!response.ok) {
            const err = await response.json();
            alert(err.detail || "Login failed");
            return;
        }

        const data = await response.json();
        authToken = data.access_token;

        // UI Updates
        joinScreen.classList.add('hidden');
        videoScreen.classList.remove('hidden');
        roomInfo.classList.remove('hidden');
        roomIdDisplay.innerText = roomId;
        localLabel.innerText = userName + " (You)";

        await startCall();

    } catch (err) {
        console.error("Auth error:", err);
        alert("Could not connect to server");
    }
};

shareScreenBtn.onclick = startScreenShare; 
stopShareBtn.onclick = stopScreenShare;
leaveBtn.onclick = () => window.location.reload();

toggleMicBtn.onclick = toggleMic;
toggleVideoBtn.onclick = toggleVideo;

// Draggable Logic
setupDraggable(localVideoContainer);
setupDraggable(remoteOverlayContainer);

// --- WebRTC Logic ---

async function startCall() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        
        // 1. Initial State: Alone in room
        // Show Local Video in MAIN container (Full Screen)
        mainVideo.srcObject = localStream;
        mainVideo.muted = true; // Mute self
        mainVideo.classList.add('mirror'); 
        
        // Hide PIP container
        localVideoContainer.classList.add('hidden');
        remoteLabelContainer.classList.add('hidden');

        connectSocket();

    } catch (err) {
        console.error("Error starting call:", err);
        alert("Could not access camera/microphone");
    }
}

function connectSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws/${roomId}?token=${authToken}`);

    socket.onopen = () => {
        console.log('Connected to signaling server');
        sendSignal({ type: 'announce', name: userName });
    };

    socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        handleSignalMessage(msg);
    };

    socket.onclose = (event) => {
        console.log("Disconnected from server.", event.code, event.reason);
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

    // Add local tracks
    localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
    });

    // Handle Remote Stream
    peerConnection.ontrack = (event) => {
        console.log("Remote track received");
        remoteStream = event.streams[0];
        
        // Switch View: Remote goes to Main, Local goes to PIP
        switchToConnectedView();
        
        // Ensure playback
        mainVideo.onloadedmetadata = () => {
             mainVideo.play().catch(e => console.error("Remote video auto-play failed:", e));
        };
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({ type: 'ice-candidate', candidate: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        console.log("Connection State:", peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed') {
            peerConnection.restartIce();
        }
        if (peerConnection.connectionState === 'disconnected') {
            // Optional: Revert to waiting view?
            // For now, let's keep it simple.
        }
    };
}

function switchToConnectedView() {
    // Prevent flickering if already switched
    if (mainVideo.srcObject === remoteStream) return;

    // 1. Move Local to PIP
    localVideo.srcObject = localStream;
    localVideoContainer.classList.remove('hidden');

    // 2. Put Remote in Main
    mainVideo.srcObject = remoteStream;
    mainVideo.muted = false; // Unmute remote
    mainVideo.classList.remove('mirror');
    remoteLabelContainer.classList.remove('hidden');
}

async function handleSignalMessage(msg) {
    if (!peerConnection && msg.type !== 'mic-status') await createPeerConnection();

    switch (msg.type) {
        case 'announce':
            console.log(`User ${msg.name} joined.`);
            showToast(`${msg.name} has joined!`);
            remoteLabel.innerText = msg.name || "Remote";
            
            // I am the Host (Received Announce). I create the Offer.
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendSignal({ type: 'offer', sdp: offer });
            break;

        case 'offer':
            console.log("Received offer");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            processIceQueue();
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignal({ type: 'answer', sdp: answer });
            break;

        case 'answer':
            console.log("Received answer");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            processIceQueue();
            break;

        case 'ice-candidate':
            if (peerConnection.remoteDescription) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (e) {
                    console.error("Error adding ice candidate", e);
                }
            } else {
                iceCandidatesQueue.push(msg.candidate);
            }
            break;
            
        case 'mic-status':
            if (msg.enabled) {
                remoteMuteIndicator.classList.add('hidden');
            } else {
                remoteMuteIndicator.classList.remove('hidden');
            }
            break;

        case 'user-left':
            handleUserLeft();
            break;
    }
}

function handleUserLeft() {
    console.log("Remote user left.");
    showToast("Remote user has left the room.");

    // Close Peer Connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Reset Remote Stream
    remoteStream = null;
    
    // Revert UI to Waiting State
    switchToWaitingView();
}

function switchToWaitingView() {
    // 1. Move Local back to Main
    mainVideo.srcObject = localStream;
    mainVideo.muted = true; 
    mainVideo.classList.add('mirror');

    // 2. Hide PIP and Remote Labels
    localVideoContainer.classList.add('hidden');
    remoteLabelContainer.classList.add('hidden');
    
    // 3. Reset Indicators
    remoteMuteIndicator.classList.add('hidden');
    remoteLabel.innerText = "Remote";
}

async function processIceQueue() {
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
            console.error("Error processing queued candidate", e);
        }
    }
}

function sendSignal(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

// --- UX Helpers ---

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'bg-blue-600 text-white px-4 py-2 rounded shadow-lg transition-opacity duration-500 opacity-0';
    toast.innerText = message;
    toastContainer.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.remove('opacity-0'));

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// --- Media Controls ---

function toggleMic() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const isEnabled = audioTrack.enabled;

            if (isEnabled) {
                toggleMicBtn.classList.replace('bg-red-600', 'bg-gray-700');
                toggleMicBtn.classList.replace('hover:bg-red-700', 'hover:bg-gray-600');
                iconMicOn.classList.remove('hidden');
                iconMicOff.classList.add('hidden');
                localMuteIndicator.classList.add('hidden');
            } else {
                toggleMicBtn.classList.replace('bg-gray-700', 'bg-red-600');
                toggleMicBtn.classList.replace('hover:bg-gray-600', 'hover:bg-red-700');
                iconMicOn.classList.add('hidden');
                iconMicOff.classList.remove('hidden');
                localMuteIndicator.classList.remove('hidden');
            }
            sendSignal({ type: 'mic-status', enabled: isEnabled });
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            if (videoTrack.enabled) {
                toggleVideoBtn.classList.replace('bg-red-600', 'bg-gray-700');
                toggleVideoBtn.classList.replace('hover:bg-red-700', 'hover:bg-gray-600');
                iconVideoOn.classList.remove('hidden');
                iconVideoOff.classList.add('hidden');
            } else {
                toggleVideoBtn.classList.replace('bg-gray-700', 'bg-red-600');
                toggleVideoBtn.classList.replace('hover:bg-gray-600', 'hover:bg-red-700');
                iconVideoOn.classList.add('hidden');
                iconVideoOff.classList.remove('hidden');
            }
        }
    }
}

// --- Screen Sharing ---

async function startScreenShare() {
    try {
        currentScreenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];
        const screenAudioTrack = currentScreenStream.getAudioTracks()[0];
        
        // Setup Audio Mixing
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioDestination = audioContext.createMediaStreamDestination();
        
        if (!micSource && localStream.getAudioTracks().length > 0) micSource = audioContext.createMediaStreamSource(localStream);
        if (micSource) micSource.connect(audioDestination);

        if (screenAudioTrack) {
            if (screenAudioSource) screenAudioSource.disconnect();
            screenAudioSource = audioContext.createMediaStreamSource(currentScreenStream);
            screenAudioSource.connect(audioDestination);
        }

        const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];

        // Replace Tracks
        if (peerConnection) {
            const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(currentScreenVideoTrack);
            const audioSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
            if (audioSender) await audioSender.replaceTrack(mixedAudioTrack);
        }

        updateUIForScreenShare(true);
        
        // Listen for browser stop
        currentScreenVideoTrack.onended = () => stopScreenShare();
        isScreenSharing = true;

    } catch (err) {
        console.error("Error starting screen share:", err);
    }
}

async function stopScreenShare() {
    if (!isScreenSharing) return;

    // Revert Tracks
    if (peerConnection) {
        const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        const localVideoTrack = localStream.getVideoTracks()[0];
        if (videoSender) await videoSender.replaceTrack(localVideoTrack);
        
        const audioSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
        const localAudioTrack = localStream.getAudioTracks()[0];
        if (audioSender) await audioSender.replaceTrack(localAudioTrack);
    }
    
    // Cleanup
    if (screenAudioSource) screenAudioSource.disconnect();
    if (currentScreenStream) {
        currentScreenStream.getTracks().forEach(track => track.stop());
        currentScreenStream = null;
    }
    
    updateUIForScreenShare(false);
    
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(console.error);
    isScreenSharing = false;
}

function updateUIForScreenShare(isSharing) {
    if (isSharing) {
        mainVideo.style.display = 'none'; 
        mainVideo.muted = true; // Prevent echo
        
        screenSharePlaceholder.classList.remove('hidden');
        screenSharePlaceholder.style.display = 'flex';

        remoteOverlayContainer.classList.remove('hidden');
        if (remoteStream) {
            remoteVideoOverlay.srcObject = remoteStream;
            remoteVideoOverlay.muted = false; // Enable audio from overlay
            
            // Auto-PiP
            if (document.pictureInPictureEnabled && remoteVideoOverlay.requestPictureInPicture) {
                if (remoteVideoOverlay.readyState >= 1) {
                    remoteVideoOverlay.requestPictureInPicture().catch(e => console.log("PiP denied:", e));
                } else {
                    remoteVideoOverlay.onloadedmetadata = () => {
                       remoteVideoOverlay.requestPictureInPicture().catch(e => console.log("PiP denied:", e));
                       remoteVideoOverlay.onloadedmetadata = null;
                    };
                }
            }
        }

        shareScreenBtn.classList.replace('bg-blue-600', 'bg-green-600'); 
        shareScreenBtn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
        shareScreenBtn.title = "Change Window";
        stopShareBtn.classList.remove('hidden');

    } else {
        mainVideo.style.display = 'block';
        
        // Restore Audio: Unmute main ONLY if it is the remote stream
        if (remoteStream && mainVideo.srcObject === remoteStream) {
            mainVideo.muted = false;
        } else {
            mainVideo.muted = true; // Waiting mode (local stream)
        }
        
        screenSharePlaceholder.classList.add('hidden');
        screenSharePlaceholder.style.display = 'none';

        remoteOverlayContainer.classList.add('hidden');
        remoteVideoOverlay.srcObject = null;
        remoteVideoOverlay.muted = true;
        
        if (remoteStream) mainVideo.srcObject = remoteStream; 

        shareScreenBtn.classList.replace('bg-green-600', 'bg-blue-600');
        shareScreenBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
        shareScreenBtn.title = "Share Screen";
        stopShareBtn.classList.add('hidden');
    }
}

// --- Draggable Utils ---
function setupDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

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
        // e.preventDefault(); 
        const touch = e.touches[0];
        pos1 = pos3 - touch.clientX;
        pos2 = pos4 - touch.clientY;
        pos3 = touch.clientX;
        pos4 = touch.clientY;
        updatePosition();
    }

    function updatePosition() {
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.bottom = 'auto'; 
        element.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        document.ontouchend = null;
        document.ontouchmove = null;
    }
}