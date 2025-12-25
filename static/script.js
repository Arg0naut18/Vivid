let localStream;
let remoteStream;
let peerConnection;
let socket;
let roomId;
let authToken;
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
const roomIdDisplay = document.getElementById('room-id-display');
const roomInfo = document.getElementById('room-info');

const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const remoteVideoOverlay = document.getElementById('remote-video-overlay');

const localVideoContainer = document.getElementById('local-video-container');
const remoteOverlayContainer = document.getElementById('remote-overlay-container');
const screenSharePlaceholder = document.getElementById('screen-share-placeholder');

const localMuteIndicator = document.getElementById('local-mute-indicator');
const remoteMuteIndicator = document.getElementById('remote-mute-indicator');

// Buttons & Icons
const shareScreenBtn = document.getElementById('share-screen');
const stopShareBtn = document.getElementById('stop-share');
const leaveBtn = document.getElementById('leave-btn');
const toggleMicBtn = document.getElementById('toggle-mic');
const toggleVideoBtn = document.getElementById('toggle-video');

const iconMicOn = document.getElementById('icon-mic-on');
const iconMicOff = document.getElementById('icon-mic-off');
const iconVideoOn = document.getElementById('icon-video-on');
const iconVideoOff = document.getElementById('icon-video-off');

// --- Event Listeners ---

joinBtn.onclick = async () => {
    roomId = roomIdInput.value.trim();
    const password = roomPasswordInput.value.trim();

    if (!roomId || !password) {
        alert("Please enter both Room ID and Password");
        return;
    }
    
    // Authenticate
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

// --- Media Control Logic ---

function toggleMic() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const isEnabled = audioTrack.enabled;

            // Update UI
            if (isEnabled) {
                toggleMicBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                toggleMicBtn.classList.add('bg-gray-700', 'hover:bg-gray-600');
                iconMicOn.classList.remove('hidden');
                iconMicOff.classList.add('hidden');
                localMuteIndicator.classList.add('hidden');
            } else {
                toggleMicBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                toggleMicBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                iconMicOn.classList.add('hidden');
                iconMicOff.classList.remove('hidden');
                localMuteIndicator.classList.remove('hidden');
            }

            // Signal to peer
            sendSignal({ type: 'mic-status', enabled: isEnabled });
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            // Update UI
            if (videoTrack.enabled) {
                toggleVideoBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
                toggleVideoBtn.classList.add('bg-gray-700', 'hover:bg-gray-600');
                iconVideoOn.classList.remove('hidden');
                iconVideoOff.classList.add('hidden');
            } else {
                toggleVideoBtn.classList.remove('bg-gray-700', 'hover:bg-gray-600');
                toggleVideoBtn.classList.add('bg-red-600', 'hover:bg-red-700');
                iconVideoOn.classList.add('hidden');
                iconVideoOff.classList.remove('hidden');
            }
        }
    }
}

// --- WebRTC Logic ---

async function startCall() {
    try {
        // 1. Get Local User Media
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        // 2. Connect to Signaling Server
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
        sendSignal({ type: 'announce' });
    };

    socket.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        handleSignalMessage(msg);
    };

    socket.onclose = (event) => {
        console.log("Disconnected from server.", event.code, event.reason);
        if (event.code === 1008 || event.code === 403) {
            alert("Connection closed (Auth Failed or Room Full): " + event.reason);
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

    peerConnection.ontrack = (event) => {
        console.log("Remote track received", event.streams[0]);
        remoteStream = event.streams[0];
        updateRemoteVideoSource();
        // Force play
        remoteVideo.play().catch(e => console.error("Remote video auto-play failed:", e));
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
    };
}

async function handleSignalMessage(msg) {
    if (!peerConnection && msg.type !== 'mic-status') await createPeerConnection();

    switch (msg.type) {
        case 'announce':
            console.log("Received announce, creating offer...");
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            sendSignal({ type: 'offer', sdp: offer });
            break;

        case 'offer':
            console.log("Received offer");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            processIceQueue(); // Process queued candidates
            
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            sendSignal({ type: 'answer', sdp: answer });
            break;

        case 'answer':
            console.log("Received answer");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            processIceQueue(); // Process queued candidates
            break;

        case 'ice-candidate':
            if (peerConnection.remoteDescription) {
                try {
                    await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
                } catch (e) {
                    console.error("Error adding ice candidate", e);
                }
            } else {
                console.log("Queueing ICE candidate (Remote description not set yet)");
                iceCandidatesQueue.push(msg.candidate);
            }
            break;
            
        case 'mic-status':
            console.log("Received mic status:", msg.enabled);
            if (msg.enabled) {
                remoteMuteIndicator.classList.add('hidden');
            } else {
                remoteMuteIndicator.classList.remove('hidden');
            }
            break;
    }
}

async function processIceQueue() {
    while (iceCandidatesQueue.length > 0) {
        const candidate = iceCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            console.log("Processed queued ICE candidate");
        } catch (e) {
            console.error("Error adding queued ice candidate", e);
        }
    }
}

function sendSignal(data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    }
}

// --- Screen Sharing & Audio Mixing ---

async function startScreenShare() {
    try {
        currentScreenStream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true, 
            audio: true 
        });
        currentScreenVideoTrack = currentScreenStream.getVideoTracks()[0];
        const screenAudioTrack = currentScreenStream.getAudioTracks()[0];
        
        // --- Audio Mixing ---
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        audioDestination = audioContext.createMediaStreamDestination();
        
        if (!micSource && localStream.getAudioTracks().length > 0) {
            micSource = audioContext.createMediaStreamSource(localStream);
        }
        if (micSource) {
            micSource.connect(audioDestination);
        }

        if (screenAudioTrack) {
            if (screenAudioSource) screenAudioSource.disconnect();
            screenAudioSource = audioContext.createMediaStreamSource(currentScreenStream);
            screenAudioSource.connect(audioDestination);
        }

        const mixedAudioTrack = audioDestination.stream.getAudioTracks()[0];

        // --- Replace Tracks in PeerConnection ---
        if (peerConnection) {
            const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
            if (videoSender) {
                await videoSender.replaceTrack(currentScreenVideoTrack);
            }

            const audioSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
            if (audioSender && mixedAudioTrack) {
                await audioSender.replaceTrack(mixedAudioTrack);
            }
        }

        updateUIForScreenShare(true);

        currentScreenVideoTrack.onended = () => {
            stopScreenShare();
        };

        isScreenSharing = true;

    } catch (err) {
        console.error("Error starting screen share:", err);
    }
}

async function stopScreenShare() {
    if (!isScreenSharing) return;

    if (peerConnection) {
        const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        const localVideoTrack = localStream.getVideoTracks()[0];
        if (videoSender && localVideoTrack) {
            await videoSender.replaceTrack(localVideoTrack);
        }

        const audioSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
        const localAudioTrack = localStream.getAudioTracks()[0];
        if (audioSender && localAudioTrack) {
            await audioSender.replaceTrack(localAudioTrack);
        }
    }

    if (screenAudioSource) screenAudioSource.disconnect();
    
    if (currentScreenStream) {
        currentScreenStream.getTracks().forEach(track => track.stop());
        currentScreenStream = null;
    }
    
    updateUIForScreenShare(false);

    if (document.pictureInPictureElement) {
        document.exitPictureInPicture().catch(console.error);
    }

    isScreenSharing = false;
}

function updateUIForScreenShare(isSharing) {
    if (isSharing) {
        remoteVideo.style.display = 'none';
        screenSharePlaceholder.style.display = 'flex';
        screenSharePlaceholder.classList.remove('hidden');

        remoteOverlayContainer.classList.remove('hidden');
        if (remoteStream) {
            remoteVideoOverlay.srcObject = remoteStream;
            
            if (document.pictureInPictureEnabled && remoteVideoOverlay.requestPictureInPicture) {
                if (remoteVideoOverlay.readyState >= 1) {
                    remoteVideoOverlay.requestPictureInPicture().catch(e => console.log("Auto PiP failed/denied:", e));
                } else {
                    remoteVideoOverlay.onloadedmetadata = () => {
                        remoteVideoOverlay.requestPictureInPicture().catch(e => console.log("Auto PiP failed/denied:", e));
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
        remoteVideo.style.display = 'block';
        screenSharePlaceholder.style.display = 'none';
        screenSharePlaceholder.classList.add('hidden');

        remoteOverlayContainer.classList.add('hidden');
        remoteVideoOverlay.srcObject = null;
        
        if (remoteStream) {
            remoteVideo.srcObject = remoteStream;
        }

        shareScreenBtn.classList.replace('bg-green-600', 'bg-blue-600');
        shareScreenBtn.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
        shareScreenBtn.title = "Share Screen";
        
        stopShareBtn.classList.add('hidden');
    }
}

function updateRemoteVideoSource() {
    if (isScreenSharing) {
        remoteVideoOverlay.srcObject = remoteStream;
        remoteVideo.srcObject = remoteStream; 
    } else {
        remoteVideo.srcObject = remoteStream;
        remoteVideoOverlay.srcObject = null;
    }
}

// --- Draggable Utilities ---

function setupDraggable(element) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    element.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        element.style.top = (element.offsetTop - pos2) + "px";
        element.style.left = (element.offsetLeft - pos1) + "px";
        element.style.bottom = 'auto';
        element.style.right = 'auto';
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
}