from fastapi import FastAPI, WebSocket, WebSocketDisconnect , Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import string
import secrets
import json , traceback
from typing import Dict, List, Optional
from datetime import datetime

app = FastAPI(title="P2P File Sharing Signaling Server")

# ===========================
# CORS CONFIGURATION
# ===========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://peer-to-peer-file-sharing-yvei.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===========================
# CONNECTION MANAGER CLASS
# ===========================
class ConnectionManager:
    def __init__(self):
        # Room structure:
        # rooms[room_id] = {
        #     "owner": WebSocket,
        #     "peers": List[WebSocket],
        #     "password": str,
        #     "pending_offer": dict or None,
        #     "created_at": datetime
        # }
        self.rooms: Dict[str, dict] = {}
        self.client_room: Dict[WebSocket, str] = {}
        self.client_joined_at: Dict[WebSocket, datetime] = {}
    
    async def create_room(self, websocket: WebSocket, room_id: str, password: str) -> bool:
        """Create a new room with the creator as owner"""
        
        # Check if room already exists
        if room_id in self.rooms:
            await websocket.send_json({
                "type": "error",
                "message": f"Room {room_id} already exists"
            })
            return False
        
        # Create room structure
        self.rooms[room_id] = {
            "owner": websocket,
            "peers": [],  # List of peer WebSockets (excluding owner)
            "password": password,
            "pending_offer": None,
            "created_at": datetime.now()
        }
        
        # Track client
        self.client_room[websocket] = room_id
        self.client_joined_at[websocket] = datetime.now()
        
        print(f"📁 Created room: {room_id} (owner created)")
        
        await websocket.send_json({
            "type": "created",
            "room_id": room_id,
            "message": "Room created successfully"
        })
        
        return True
    
    async def join_room(self, websocket: WebSocket, room_id: str, password: str) -> bool:
        """Join an existing room"""
        
        # Check if room exists
        if room_id not in self.rooms:
            await websocket.send_json({
                "type": "error",
                "message": f"Room {room_id} not found"
            })
            return False
        
        room = self.rooms[room_id]
        
        # Check password
        if room["password"] != password:
            await websocket.send_json({
                "type": "error",
                "message": "Invalid password"
            })
            return False
        
        # Check room size limit
        MAX_ROOM_SIZE = 10
        current_peers = len(room["peers"]) + 1  # +1 for owner
        if current_peers >= MAX_ROOM_SIZE:
            await websocket.send_json({
                "type": "error",
                "message": f"Room {room_id} is full"
            })
            return False
        
        # Add peer to room
        room["peers"].append(websocket)
        self.client_room[websocket] = room_id
        self.client_joined_at[websocket] = datetime.now()
        
        print(f"✅ Peer joined room {room_id}. Total peers: {len(room['peers'])}")
        
        # Notify the joiner
        await websocket.send_json({
            "type": "joined",
            "room_id": room_id,
            "message": f"Joined room. Total peers: {len(room['peers']) + 1}"
        })
        
        # If there's a pending offer from the owner, send it to the new peer
        if room["pending_offer"]:
            await websocket.send_json({
                "type": "offer",
                "from": "owner",
                "payload": room["pending_offer"]
            })
            print(f"📤 Sent pending offer to new peer in {room_id}")
        
        # Notify owner that a new peer joined
        owner = room["owner"]
        await owner.send_json({
            "type": "new_peer",
            "peer_id": id(websocket),
            "message": "A new peer joined the room"
        })
        
        return True
    
    async def accept_connection(self, websocket: WebSocket, room_id: str):
        """Accept WebSocket connection"""
        await websocket.accept()
        print(f"🔌 WebSocket accepted for potential room: {room_id}")
    
    def disconnect(self, websocket: WebSocket):
        """Remove a client from their room"""
        
        if websocket not in self.client_room:
            return
        
        room_id = self.client_room[websocket]
        
        if room_id not in self.rooms:
            # Clean up orphaned mapping
            del self.client_room[websocket]
            if websocket in self.client_joined_at:
                del self.client_joined_at[websocket]
            return
        
        room = self.rooms[room_id]
        
        # Check if this is the owner
        if room["owner"] == websocket:
            # Owner left - close the room
            print(f"👑 Owner left room {room_id}. Closing room.")
            
            # Notify all peers that room is closing
            for peer in room["peers"]:
                try:
                    peer.send_json({
                        "type": "room_closed",
                        "message": "Room owner has left"
                    })
                except:
                    pass
            
            # Delete the room
            del self.rooms[room_id]
            
        else:
            # Remove from peers list
            if websocket in room["peers"]:
                room["peers"].remove(websocket)
                print(f"❌ Peer left room {room_id}. Remaining peers: {len(room['peers'])}")
        
        # Clean up client mappings
        del self.client_room[websocket]
        if websocket in self.client_joined_at:
            del self.client_joined_at[websocket]
    
    async def store_offer(self, websocket: WebSocket, offer_data: dict):
        """Store offer from owner for later delivery"""
        
        if websocket not in self.client_room:
            return
        
        room_id = self.client_room[websocket]
        room = self.rooms[room_id]
        
        # Only owner should send offers (or verify)
        if room["owner"] != websocket:
            await websocket.send_json({
                "type": "error",
                "message": "Only room owner can send offers"
            })
            return
        
        # Store the offer
        room["pending_offer"] = offer_data.get("payload")
        print(f"📦 Stored offer for room {room_id}")
        
        # Send confirmation
        await websocket.send_json({
            "type": "offer_stored",
            "message": "Offer stored, waiting for peers"
        })
    
    async def broadcast_to_room(self, sender: WebSocket, message: dict):
        """Send a message to all clients in the same room, excluding the sender"""
        
        if sender not in self.client_room:
            print("⚠️ Sender not found in any room")
            return
        
        room_id = self.client_room[sender]
        
        if room_id not in self.rooms:
            print(f"⚠️ Room {room_id} not found")
            return
        
        room = self.rooms[room_id]
        
        # Determine who should receive
        recipients = []
        
        if room["owner"] == sender:
            # Owner sending - send to all peers
            recipients = room["peers"]
        else:
            # Peer sending - send to owner only
            recipients = [room["owner"]]
        
        sent_count = 0
        for recipient in recipients:
            try:
                await recipient.send_json(message)
                sent_count += 1
            except Exception as e:
                print(f"⚠️ Failed to send to client: {e}")
        
        msg_type = message.get("type", "unknown")
        print(f"📨 Broadcast {msg_type} to {sent_count} recipient(s)")
    
    async def forward_answer(self, sender: WebSocket, answer_data: dict):
        """Forward answer from peer to owner"""
        
        if sender not in self.client_room:
            return
        
        room_id = self.client_room[sender]
        room = self.rooms[room_id]
        
        # Send answer to owner
        owner = room["owner"]
        await owner.send_json({
            "type": "answer",
            "from": "peer",
            "payload": answer_data.get("payload")
        })
        print(f"📤 Forwarded answer to owner in room {room_id}")
    
    def get_room_info(self, room_id: str) -> dict:
        """Get information about a room"""
        
        if room_id not in self.rooms:
            return {"exists": False, "clients": 0}
        
        room = self.rooms[room_id]
        total_clients = len(room["peers"]) + 1  # peers + owner
        
        return {
            "exists": True,
            "clients": total_clients,
            "peers": len(room["peers"]),
            "created_at": room["created_at"].isoformat() if room["created_at"] else None
        }
    
    def get_stats(self) -> dict:
        """Get server statistics"""
        
        total_clients = 0
        rooms_info = []
        
        for room_id, room in self.rooms.items():
            clients_in_room = len(room["peers"]) + 1
            total_clients += clients_in_room
            rooms_info.append({
                "room_id": room_id,
                "clients": clients_in_room,
                "peers": len(room["peers"])
            })
        
        return {
            "total_rooms": len(self.rooms),
            "total_clients": total_clients,
            "rooms": rooms_info
        }

# Create global connection manager instance
manager = ConnectionManager()

# ===========================
# WEBSOCKET HANDLERS
# ===========================

@app.websocket("/ws/{room_id}")
async def websocket_handler(websocket: WebSocket, room_id: str):
    """
    Main WebSocket endpoint for signaling.
    """
    
    # Step 1: Accept the connection
    await manager.accept_connection(websocket, room_id)
    
    try:
        # Step 2: Main message loop
        while True:
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })
                continue
            
            msg_type = message.get("type")
            
            if not msg_type:
                await websocket.send_json({
                    "type": "error",
                    "message": "Missing 'type' field"
                })
                continue
            
            # Route to appropriate handler
            if msg_type == "create":
                # Create room
                rid = message.get("roomId")
                pwd = message.get("password")
                if rid and pwd:
                    await manager.create_room(websocket, rid, pwd)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "roomId and password required"
                    })
            
            elif msg_type == "join":
                # Join room
                rid = message.get("roomId")
                pwd = message.get("password")
                if rid and pwd:
                    await manager.join_room(websocket, rid, pwd)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "roomId and password required"
                    })
            
            elif msg_type == "offer":
                # Store offer from owner
                await manager.store_offer(websocket, message)
            
            elif msg_type == "answer":
                # Forward answer to owner
                await manager.forward_answer(websocket, message)
            
            elif msg_type == "ice-candidate":
                # Forward ICE candidate
                await manager.broadcast_to_room(websocket, message)
            
            elif msg_type == "leave":
                manager.disconnect(websocket)
                await websocket.send_json({
                    "type": "left",
                    "message": "You left the room"
                })
                break
            
            elif msg_type == "ping":
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": message.get("timestamp")
                })
            
            else:
                print(f"⚠️ Unknown message type: {msg_type}")
                await manager.broadcast_to_room(websocket, message)
    
    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected")
        manager.disconnect(websocket)
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        traceback.print_exc()
        manager.disconnect(websocket)

# ===========================
# HTTP ENDPOINTS
# ===========================

@app.get("/")
async def root(request : Request):
    host = request.headers["host"]
    return {
        "service": "P2P File Sharing Signaling Server",
        "status": "running",
        "version": "1.0.0",
        "websocket_endpoint": f"wss://{host}/ws/{{room_id}}"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.get("/stats")
async def get_stats():
    return manager.get_stats()

@app.get("/room/{room_id}")
async def get_room_info(room_id: str):
    return manager.get_room_info(room_id)

# ===========================
# RUN THE SERVER
# ===========================
if __name__ == "__main__":
    print("🚀 Starting P2P File Sharing Signaling Server...")
    print("📡 WebSocket endpoint: ws://localhost:8000/ws/{room_id}")
    print("🔧 HTTP endpoints: /, /health, /stats, /room/{room_id}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True
    )