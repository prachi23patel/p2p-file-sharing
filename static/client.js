// -------------
// this client.js is for mulitple client mesh connection
// -------------

// global variables
let ws = null;
let pc = {};
let dataChannel = {};
let roomId = null;
let password = null;
let myId = null;

// DOM elements
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

// helper unctions
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

// data channel handlers
function setupDataChannelHandlers(key_in_setup) {
    if (!dataChannel[key_in_setup]) 
        return;
    
    dataChannel[key_in_setup].onopen = () => {
        updateStatus("✅ Data channel ready!");
        msgInput.disabled = false;
        sendBtn.disabled = false;
    };
    
    dataChannel[key_in_setup].onclose = () => {
        updateStatus("Data channel closed");
        sendBtn.disabled = true;
    };
    
    dataChannel[key_in_setup].onmessage = (event) => {
        addMessage(key_in_setup, event.data);
    };
}
// Webrtc peer connection
function createPeerConnection(peerId , is_myId_offerer){
    // peerId here is for which we have to create peerconnection
    const configuration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
    let key_in_peerconn = "pc_"+peerId;
    pc[key_in_peerconn] = new RTCPeerConnection(configuration);
    pc[key_in_peerconn].onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: "ice-candidate",
                from : myId,
                to : peerId,
                roomId: roomId,
                payload: event.candidate
            }));
        }
    };
    
    pc[key_in_peerconn].onconnectionstatechange = () => {
        if (pc[key_in_peerconn].connectionState === "connected") {
            updateStatus("✅ WebRTC connected!");
        }
    };
    if(is_myId_offerer){
        dataChannel[key_in_peerconn] = pc[key_in_peerconn].createDataChannel("fileChannel");
        setupDataChannelHandlers(key_in_peerconn);
    }else{
        pc[key_in_peerconn].ondatachannel = (event) => {
            dataChannel[key_in_peerconn] = event.channel;
            setupDataChannelHandlers(key_in_peerconn);
        };
    }
}

async function startOfferer(peerId) {
    // peerId here is for which we have to create peerconnection and offer
    console.log("in offerer" +peerId);
    createPeerConnection(peerId , true);
    let key_in_start_offer = "pc_"+peerId;
    console.log("in offerer " +key_in_start_offer);
    const offer = await pc[key_in_start_offer].createOffer();
    await pc[key_in_start_offer].setLocalDescription(offer);
    ws.send(JSON.stringify({
        type: "offer",
        roomId: roomId,
        from: myId,
        to:peerId,
        payload: offer
    }));
    updateStatus("Waiting for peer to join...");
}

async function startAnswerer(peerId) {
    console.log("in answerer " + peerId)
    createPeerConnection(peerId , false);
    updateStatus("Waiting for offer...");
}

// signaling connection
function connectToSignaling(role) {
    const wsUrl = `wss://peer-to-peer-file-sharing-yvei.vercel.app/ws/${roomId}`;

    console.log("Connecting to:", wsUrl);  // Verify URL has actual room ID
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
        updateStatus("Connected to signaling server");
        if (role === "offerer") {
            addmsg("password for creating  " + password);
            ws.send(JSON.stringify({ type: "create", roomId: roomId  , "pwd" : password}));
            // startOfferer();
        } else if(role === "answerer") {
            addmsg("password for  joining " + password);
            ws.send(JSON.stringify({ type: "join", roomId: roomId  , password : password}));
            // startAnswerer();
        }
    };
    
    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        let key = "pc_"+message.from;
        console.log(message)
        console.log(key);
        console.log(pc)
        switch(message.type) {
            case "offer":
                // FIX: Safely ensure peer connection exists before calling methods on it
                if (!pc[key]) {
                    createPeerConnection(message.from , false);
                }
                console.log(key + "offer")
                await pc[key].setRemoteDescription(message.payload);
                const answer = await pc[key].createAnswer();
                await pc[key].setLocalDescription(answer);
                ws.send(JSON.stringify({ type: "answer", roomId: roomId,from : myId , to : message.from , payload: answer }));
                break;
                
            case "answer":
                console.log(key + "ans")
                await pc[key].setRemoteDescription(message.payload);
                break;
                
            case "ice-candidate":
                console.log(key + "ice")
                await pc[key].addIceCandidate(message.payload);
                break;

            case "new_peer":
                console.log("new_peer joined " + message.new_peerId);
                startOfferer(message.new_peerId);
                break;

            case "already_joined_peers":
                console.log("Full payload keys:", Object.keys(message));
                let joined_peer = message.joined_peers
                console.log(joined_peer)
                console.log(typeof(joined_peer))
                joined_peer.forEach(peer => {
                    startAnswerer(peer)
                });
                break;
            
            case "created":
                myId = message.peerId;
                break;

            case "joined":
                myId = message.peerId;
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


// ui handelers
createBtn.onclick = (e) => {
    e.preventDefault();

    roomId = generateRandomString(6);
    roomIdValue.innerText = roomId;
    createRoomId.value = roomId;

    password = generateRandomString(8);
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
    console.log("pc_"+myId)
    console.log(dataChannel)
    if(dataChannel){
        // Iterating over values only
        Object.values(dataChannel).forEach(channel => {
            channel.send(message);
        });
        addMessage("You" , message);
        msgInput.value = "";
    }
    // if (dataChannel && dataChannel["pc_"+myId].readyState === "open") {
    //     dataChannel["pc_"+myId].send(message);
    //     addMessage("You", message);
    //     msgInput.value = "";
    // } 
    else {
        updateStatus("Data channel not ready");
    }
};
sendBtn.disabled = true;
updateStatus("Ready. Create or join a room.");