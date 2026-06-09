// ===========================
// GLOBAL VARIABLES
// ===========================
let ws = null;
let pc = null;
let dataChannel = null;
let roomId = null;
let password = null;

// DOM Elements
const createBtn = document.getElementById("createBtn");
const roomInput = document.getElementById("roomInput");
const joinBtn = document.getElementById("joinBtn");
const statusDiv = document.getElementById("status");
const msgInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const msgsDiv = document.getElementById("messages");
const roomIdValue = document.getElementById("roomIdValue");
const createpass = document.getElementById("createPassword").value;
const createRoomId = document.getElementById("createRoomId");
const joinPassword = document.getElementById("joinPassword");
// ===========================
// HELPER FUNCTIONS
// ===========================
function addmsg(msg){
    msgsDiv.innerText += " " +msg
}
function generateRandomString(len) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < len; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters.charAt(randomIndex);
    }
    return result;
}

function updateStatus(message) {
    statusDiv.innerText = message;
    console.log(`[Status] ${message}`);
}

function addMessage(sender, text) {
    msgsDiv.innerHTML += `<div><b>${sender}:</b> ${text}</div>`;
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
}

// ===========================
// DATA CHANNEL HANDLERS
// ===========================
function setupDataChannelHandlers() {
    if (!dataChannel) return;
    
    dataChannel.onopen = () => {
        updateStatus("✅ Data channel ready!");
        msgInput.disabled = false;
        sendBtn.disabled = false;
    };
    
    dataChannel.onclose = () => {
        updateStatus("Data channel closed");
        sendBtn.disabled = true;
    };
    
    dataChannel.onmessage = (event) => {
        addMessage("Peer", event.data);
    };
}

// ===========================
// WEBRTC FUNCTIONS
// ===========================
function createPeerConnection(isOfferer) {
    const configuration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
    
    pc = new RTCPeerConnection(configuration);
    
    pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "ice-candidate",
                roomId: roomId,
                payload: event.candidate
            }));
        }
    };
    
    pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
            updateStatus("✅ WebRTC connected!");
        }
    };
    
    if (isOfferer) {
        dataChannel = pc.createDataChannel("fileChannel");
        setupDataChannelHandlers();
    } else {
        pc.ondatachannel = (event) => {
            dataChannel = event.channel;
            setupDataChannelHandlers();
        };
    }
    
    return pc;
}

async function startOfferer() {
    createPeerConnection(true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({
        type: "offer",
        roomId: roomId,
        payload: offer
    }));
    updateStatus("Waiting for peer to join...");
}

async function startAnswerer() {
    createPeerConnection(false);
    updateStatus("Waiting for offer...");
}

// ===========================
// SIGNALING CONNECTION 
// ===========================
function connectToSignaling(role) {
    const wsUrl = `wss://peer-to-peer-file-sharing-production-d1a0.up.railway.app/ws/${roomId}`;

    console.log("Connecting to:", wsUrl);  // Verify URL has actual room ID
    print(wsUrl);
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        updateStatus("Connected to signaling server");
        if (role === "offerer") {
            addmsg("password for creating  " + password);
            ws.send(JSON.stringify({ type: "create", roomId: roomId  , password : password}));
            startOfferer();
        } else if(role === "answerer") {
            addmsg("password for  joining " + password);
            ws.send(JSON.stringify({ type: "join", roomId: roomId  , password : password}));
            startAnswerer();
        }
    };
    
    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        
        switch(message.type) {
            case "offer":
                // FIX: Safely ensure peer connection exists before calling methods on it
                if (!pc) {
                    createPeerConnection(false);
                }
                await pc.setRemoteDescription(message.payload);
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: "answer", roomId: roomId, payload: answer }));
                break;
                
            case "answer":
                await pc.setRemoteDescription(message.payload);
                break;
                
            case "ice-candidate":
                await pc.addIceCandidate(message.payload);
                break;
            default:
                
                addmsg(message.type + " " + message.room_id + " " + message.message)
        }
    };
    
    ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        console.log("URL:", wsUrl);
        updateStatus("Connection error");
    };
    
    ws.onclose = () => {
        console.log("Close code:", event.code);
    console.log("Close reason:", event.reason);
        updateStatus("Disconnected");
        sendBtn.disabled = true;
    };
}

// ===========================
// UI HANDLERS
// ===========================
createBtn.onclick = (e) => {
    // createBtn.innerText = "Start Room"
    e.preventDefault();
    roomId = generateRandomString(6);
    roomIdValue.innerText = roomId;
    createRoomId.value = roomId;
    password = generateRandomString(8);
    // createpass.value = password;
    document.getElementById("createPassword").value = password;
    updateStatus(`Creating room: ${roomId}...`);
    connectToSignaling("offerer");
};
joinBtn.onclick = (e) => {
    e.preventDefault();
    roomId = roomInput.value.trim();
    if (!roomId) {
        alert("Enter room ID");
        return;
    }
    roomIdValue.innerText = roomId;
    password = joinPassword.value.trim();
    if (!roomId) {
        alert("Enter  paasword");
        return;
    }
    updateStatus(`Joining room: ${roomId}...`);
    connectToSignaling("answerer");
};

sendBtn.onclick = () => {
    const message = msgInput.value.trim();
    if (!message) return;
    
    if (dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(message);
        addMessage("You", message);
        msgInput.value = "";
    } else {
        updateStatus("Data channel not ready");
    }
};

sendBtn.disabled = true;
updateStatus("Ready. Create or join a room.");