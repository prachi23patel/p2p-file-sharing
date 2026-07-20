// -------------
// this client.js is for multiple client mesh connection
// -------------
// ===========================
// GLOBAL VARIABLES
// ===========================
let ws = null;
let room_name = null;
let roomId = null;
let myId = null;
let pc = {};           // { "pc_peerId": RTCPeerConnection }
let dataChannel = {};  // { "pc_peerId": RTCDataChannel }
let myName = null;
let incomingChunks = [];
let incomingFileName = "";
let incomingFileSender = "";
let incomingFileSize = 0;  // For file transfer
let all_peers_id = [];
let all_peers_name = [];
let isInRoom = false;

let roomModule = null;

// ===========================
// DATA CHANNEL HANDLERS
// ===========================
async function setupDataChannelHandlers(peerId) {
    const key = "pc_" + peerId;
    if (!dataChannel[key]) {
        console.log("❌ Data channel not found for key:", key);
        return;
    }
    // console.log("Ready state:", dataChannel[key].readyState);
    dataChannel[key].onopen = async () => {
        // console.log(`✅ Data channel open with peer: ${peerId}`);
        roomModule = await import("./room.js");
        // Enable UI for sending messages
        // console.log("inclient all_peers_names : " ,all_peers_name);
        roomModule.renderPeers(all_peers_name);
    };
    
    dataChannel[key].onclose = () => {
        // console.log(`🔒 Data channel closed with peer: ${peerId}`);
    };

    dataChannel[key].onmessage = async (event) => {

        // console.log(`💬 Message from ${peerId}:`, event.data);
        // Try to parse as JSON for structured messages
            if(typeof event.data === "string") {
                const msg = JSON.parse(event.data);
                
                if(msg.type == "text"){
                    roomModule.appendTextMessage(msg);
                }
                if(msg.type == "file"){
                    incomingFileName = msg.name;
                    incomingFileSender = msg.sender;
                    // console.log("file recieved");
                }
                else if(msg.type === "file-end"){
                    const blob = new Blob(incomingChunks);
                    roomModule.showDownloadButton(blob,incomingFileName , incomingFileSender);
                    // console.log("File complete");
                }
            }
            else {
                incomingChunks.push(event.data);
            }
            
    };
}
function createPeerConnection(webso , peerId, isOfferer) {
    const configuration = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
    
    const key = "pc_" + peerId;
    
    // ✅ FIXED: Don't create if already exists
    if (pc[key]) {
        console.log(`⚠️ Peer connection for ${peerId} already exists`);
        return pc[key];
    }   
    // console.log(`🔗 Creating peer connection for ${peerId} (offerer: ${isOfferer})`);
    
    pc[key] = new RTCPeerConnection(configuration);
    pc[key].onicecandidate = (event) => {
        if (event.candidate && webso && webso.readyState === WebSocket.OPEN) {
            webso.send(JSON.stringify({
                type: "ice-candidate",
                from: myId,
                to: peerId,
                roomId: roomId,
                payload: event.candidate
            }));
        }
    };
    pc[key].onconnectionstatechange = () => {
        // console.log(`🔗 Connection state for ${peerId}: ${pc[key].connectionState}`);
        
        if (pc[key].connectionState === "connected") {
            // if(Object.keys(pc).length != Object.keys(dataChannel).length)console.log("pc : "+ Object.keys(pc).length + "datachannel : "+ Object.keys(dataChannel).length )
            // console.log(`✅ Connected to ${peerId}. Total peers: ${Object.keys(pc).length}`);
        }
        
        if (pc[key].connectionState === "failed") {
            console.log(`❌ Connection failed for ${peerId}`);
            // Clean up
            delete pc[key];
            delete dataChannel[key];
            roomModule.renderPeers(all_peers_name);
        }
    };  
    
    // Data channel setup
    if (isOfferer) {
        // Offerer creates data channel
        if(dataChannel[key]){
            delete dataChannel[key];
        }
        dataChannel[key] = pc[key].createDataChannel("fileChannel");
        // console.log(`📡 Created data channel for ${peerId}`);
        setupDataChannelHandlers(peerId);
    } else {
        // Answerer waits for data channel
        pc[key].ondatachannel = (event) => {
            dataChannel[key] = event.channel;
            // console.log(`📡 Received data channel from ${peerId}`);
            setupDataChannelHandlers(peerId);
        };
    }
    
    return pc[key];
}

// ===========================
// WEBRTC OFFER/ANSWER
// ===========================
async function startOfferer(webso , peerId) {
    // console.log(`🎯 Starting offerer for peer: ${peerId}`);
    myId = sessionStorage.getItem('myId');
    const key = "pc_" + peerId;
    
    // Create peer connection if it doesn't exist
    if (!pc[key]) {
        createPeerConnection(webso , peerId, true);
    }
    
    try {
        const offer = await pc[key].createOffer();
        await pc[key].setLocalDescription(offer);
        
        webso.send(JSON.stringify({
            type: "offer",
            roomId: roomId,
            from: myId,
            to: peerId,
            payload: offer
        }));
        
        // console.log(`📤 Offer sent to ${peerId}`);
    } catch (error) {
        console.error(`❌ Error creating offer for ${peerId}:`, error);
    }
}

async function startAnswerer(webso , peerId) {
    // console.log(`🎯 Starting answerer for peer: ${peerId}`);
    const key = "pc_" + peerId;
    
    // Create peer connection if it doesn't exist
    if (!pc[key]) {
        createPeerConnection(webso ,peerId, false);
    }
    // console.log(`⏳ Waiting for offer from ${peerId}`);
}

// ===========================
// SIGNALING CONNECTION
// ===========================
async function connectToSignaling(role) {
    const wsUrl = `wss://p2p-file-sharing-zcfy.onrender.com//ws/${roomId}`;
    return new Promise((resolve, reject) => {
        let joinResolve = resolve;
        // console.log(`🔌 Connecting to signaling server: ${wsUrl}`);
        myId = sessionStorage.getItem('myId');
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            // console.log(`✅ Connected to signaling server as ${role}`);
            
            if (role === "offerer") {
                ws.send(JSON.stringify({
                    type: "create",
                    roomId: roomId,
                    my_name : myName,
                    myId: myId
                }));
                // console.log(`📤 Sent create room request for ${roomId}`);
            } else if (role === "answerer") {
                ws.send(JSON.stringify({
                    type: "join",
                    roomId: roomId,
                    my_name : myName,
                    myId: myId
                }));
                // console.log(`📤 Sent join room request for ${roomId}`);
            }
        };

        ws.onmessage = async (event) => await websocket_messages(ws , JSON.parse(event.data) , joinResolve);

        ws.onerror = (error) => {
            console.error('❌ WebSocket error:', error);
            // console.log(`URL: ${wsUrl}`);
        };

        ws.onclose = (event) => {
            // console.log(`🔌 WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
            
            // Handle reconnection
            if (event.code === 1001 || event.code === 1006) {
                console.log('🔄 Attempting to reconnect...');
                setTimeout(() => {connectToSignaling(role);}, 2000);
            }
        };
    });
    console.log("connect to signaling ended");
}

export async function websocket_messages(wes , message , joinResolve){
    // const home = await import('./home2.js');
        try {
            // console.log(`📨 Received message:`, message.type);
            myId = sessionStorage.getItem('myId');
            switch (message.type) {
                case "offer": {
                    
                    const peerId = message.from;
                    const key = "pc_" + peerId;
                    
                    // console.log(`📞 Received offer from ${peerId}`);
                    
                    // Ensure peer connection exists
                    if (!pc[key]) {
                        createPeerConnection(wes ,peerId, false);
                    }
                    
                    await pc[key].setRemoteDescription(message.payload);
                    const answer = await pc[key].createAnswer();
                    await pc[key].setLocalDescription(answer);
                    
                    wes.send(JSON.stringify({
                        type: "answer",
                        roomId: roomId,
                        from: myId,
                        to: peerId,
                        payload: answer
                    }));
                    
                    // console.log(`📤 Answer sent to ${peerId}`);
                    break;
                }
                
                case "answer": {
                    const peerId = message.from;
                    const key = "pc_" + peerId;
                    
                    // console.log(`🔑 Received answer from ${peerId}`);
                    
                    if (pc[key]) {
                        await pc[key].setRemoteDescription(message.payload);
                        // console.log(`✅ Remote description set for ${peerId}`);
                    } else {
                        console.log(`⚠️ Peer connection for ${peerId} not found`);
                    }
                    break;
                }
                
                case "ice-candidate": {
                    const peerId = message.from;
                    const key = "pc_" + peerId;
                    
                    // console.log(`🧊 Received ICE candidate from ${peerId}`);
                    
                    if (pc[key]) {
                        await pc[key].addIceCandidate(message.payload);
                    } else {
                        console.log(`⚠️ Peer connection for ${peerId} not found, storing candidate`);
                        // Store candidate for later
                    }
                    break;
                }
                
                case "new_peer": {
                    const newPeerId = message.new_peerId;
                    all_peers_name.push(message.new_peerName);
                    all_peers_id.push(newPeerId)
                    // console.log(`👋 New peer joined: ${newPeerId}`);
                    
                    // Only start offerer if it's not ourselves
                    if (newPeerId !== myId) {
                        const key = "pc_" + newPeerId;
                        if(pc[key]){
                            delete pc[key];
                        }
                        if(dataChannel[key]){
                            delete dataChannel[key];
                        }
                        await startOfferer(wes , newPeerId);
                    }
                    break;
                }
                
                case "already_joined_peers": {
                    message.peers.forEach(peer => {all_peers_id.push(peer)});
                    message.peer_names.forEach(peer => {all_peers_name.push(peer)});
                    // console.log(`📋 Existing peers:`, all_peers_id);
                    
                    for (const peer of all_peers_id) {
                        if (peer !== myId) {
                            // console.log(`🔗 Connecting to existing peer: ${peer}`);
                            await startAnswerer(wes , peer);
                        }
                    }
                    break;
                }
                case "peer_left" : {
                    const peerId = message.peerId;
                    const peer_name = message.peer_name;
                    // console.log("peer-left :" , peerId , " " , peer_name);
                    const key = "pc_" + peerId;
                    let index = all_peers_id.indexOf(peerId);
                    if (index !== -1) {all_peers_id.splice(index, 1); }
                    index = all_peers_name.indexOf(peer_name);
                    if (index !== -1) {all_peers_name.splice(index, 1); }
                    roomModule.renderPeers(all_peers_name);
                    break;
                }
                case "created":
                    isInRoom = true;
                    if (joinResolve) {
                        joinResolve();      // This finishes await connectToSignaling()
                        joinResolve = null;
                    }
                    console.log(isInRoom , "in created");
                    // console.log(`✅ Room created: ${message.roomId}`);
                    break;
                    
                case "joined":
                    isInRoom = true;
                    if (joinResolve) {
                        joinResolve();      // This finishes await connectToSignaling()
                        joinResolve = null;
                    }
                    console.log(isInRoom , "in joined");
                    // console.log(`✅ Joined room: ${message.roomId}`);
                    break;
                    
                default:
                    // home.showToast(message , 'error');
                    console.log(`❓ Unknown message type: ${message.type}`);
                    console.log(message);
            }
        } catch (error) {
            // console.error('❌ Error processing message:', error);
        }
    };
export async function create(name, roomId1, peerId , my_name , isCreate) {
    // console.log(`🏠 Creating room: ${name} (${roomId1}) as ${peerId}`);
    
    // Store session data
    sessionStorage.setItem('currentRoomId', roomId1);
    sessionStorage.setItem('myId', peerId);
    sessionStorage.setItem('room_name', name);
    sessionStorage.setItem('my_name', my_name);
    
    // Set global variables
    room_name = name;
    roomId = roomId1;
    myId = peerId;
    myName = my_name;
    // Reset peer connections (new session)
    pc = {};
    dataChannel = {};
    if(isCreate){
        // console.log(`📡 Connecting to signaling as offerer...`);
        await connectToSignaling("offerer");
    }else{
        // console.log(`📡 Connecting to signaling as answerer...`);
        await connectToSignaling("answerer");
    }
    if (isInRoom){return true;}
    console.log(isInRoom , "returned");
    return false;
}

export async function sendMsg(message , isFile , selectedFile) {
    // console.log(`💬 Sending message: ${message}`);
    // console.log(`📡 Data channels:`, Object.keys(dataChannel));
    const CHUNK_SIZE = 16 * 1024;
    
    if (!dataChannel || Object.keys(dataChannel).length === 0) {
        // console.log('⚠️ No data channels available');
        return;
    }
    
    // Send to ALL connected peers
    let sentCount = 0;
    for (const [key, channel] of Object.entries(dataChannel)) {
        if (channel.readyState === "open") {
            try {
                myName = sessionStorage.getItem('my_name');
                if(isFile){
                    await channel.send(JSON.stringify(message));
                    const buffer = await selectedFile.arrayBuffer();
                    for(
                        let offset = 0;
                        offset < buffer.byteLength;
                        offset += CHUNK_SIZE
                    ){
                        const chunk = buffer.slice(
                            offset,
                            offset + CHUNK_SIZE
                        );
                        await channel.send(chunk);
                    }
                    channel.send(JSON.stringify({
                        type: "file-end"
                    }));

                    // console.log("File sent");
                }else{
                    channel.send(JSON.stringify({
                        type : "text",
                        text:   message,
                        sender: myName,
                        self:   false,
                        time:   "",
                                // ? new Date(data.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                // : nowTime(),
                    }));
                }
                sentCount++;
                // console.log(`✅ Sent to ${key}`);
            } catch (error) {
                // console.error(`❌ Failed to send to ${key}:`, error);
            }
        } else {
            // console.log(`⚠️ Channel ${key} not open (state: ${channel.readyState})`);
        }
    }
    // console.log(`📤 Message sent to ${sentCount} peer(s)`);
}