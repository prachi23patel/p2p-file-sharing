from fastapi import FastAPI , WebSocket , WebSocketDisconnect , Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import json , traceback
from typing import Dict , List ,Optional
from datetime import datetime

app = FastAPI(title="P2P File Sharing Signaling Server")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://peer-to-peer-file-sharing-yvei.vercel.app",
                     "http://localhost:5500",         # Local development
                     "http://localhost:8000"],          # Local backend]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# connection manager class
class ConnectionManager():
    def __init__(self):
        self.all_peers : Dict[str , WebSocket] = {} # stores websocket <- peerId
        self.peer_room : Dict[str , str] = {} # stores peerId -> roomId
        self.peer_joined_at : Dict[str , datetime] = {} # stores peerId -> datetime
        self.rooms : Dict[str , Dict] = {}
        # rooms[room_id] : peers -> list , created_at -> str , password -> str

    async def create_room(self , websocket : WebSocket , room_id : str , password : str) :
        if room_id in self.rooms:
            await websocket.send_json({
                "type" : "error",
                "message" : "room already exists"
            })
            return False

        # set all data for new room
        peerId = "peer - " + str(len(self.all_peers))
        self.all_peers[peerId] = websocket
        self.peer_room[peerId] = room_id
        self.peer_joined_at[peerId] = datetime
        self.rooms[room_id] = {
            "peers": [peerId], 
            "password": password,
            "created_at": datetime.now()
        }
        print(self.rooms[room_id])
        print(f"{room_id} room created")

        await websocket.send_json({
            "type" : "created",
            "roomId" : room_id,
            "peerId" : peerId
        })

        return True
    
    async def join_room(self , websocket : WebSocket ,room_id : str , password : str):

        # check room_id exists or not
        if room_id not in self.rooms:
            await websocket.send_json({
                "type" : "error",
                "message" : f"{room_id} doesn't exists"
            })
            return False
        
        # check password matches or not
        if self.rooms[room_id]["password"] != password:
            await websocket.send_json({
                "type" : "error",
                "message" : f"password doesn't match"
            })
            return False

        # check room limit
        if len(self.rooms[room_id]["peers"]) > 9:
            await websocket.send_json({
                "type" : "error",
                "message" : f"room is full"
            })
            return False

        # join new peer in room
        peerId = "peer - " + str(len(self.all_peers))
        self.all_peers[peerId] = websocket
        print(self.all_peers)
        self.peer_room[peerId] = room_id
        self.peer_joined_at[peerId] = datetime

        await websocket.send_json({
            "type" : "joined",
            "roomId" : room_id,
            "peerId" : peerId
        })
        
        print(f"{peerId} joined room {room_id}")
        await self.new_peer_notification(peerId, self.rooms[room_id]["peers"])
        # append new peer after sending notification
        self.rooms[room_id]["peers"].append(peerId)
        return True
    
    async def new_peer_notification(self , new_peer : str , joined_peers : List):
        if new_peer not in self.all_peers:
                print("newly joined peer not found in all_peers")
                return
        for peer in joined_peers:
            print(peer)
            ws = self.all_peers[peer]
            if ws:
                await ws.send_json({
                    "type" : "new_peer",
                    "new_peerId" : new_peer
                })
            else:
                print("websocket is none")
        new_ws = self.all_peers[new_peer]
        await new_ws.send_json({
            "type" : "already_joined_peers",
            "joined_peers" : joined_peers
        }) 

                

    async def accept_connection(self , websocket : WebSocket , room_id : str):
        await websocket.accept()
        print(f"🔌 WebSocket accepted for potential room: {room_id}")
    async def disconnect(self , websocket : WebSocket):
        # check if peer exists or not
        key = next((k for k , v in self.all_peers.items() if v == websocket) , None)
        if not key:
            return
        if key not in self.peer_room:
            return
        room_from = self.peer_room[key]

        if room_from not in self.rooms:
            return
        if key not in self.rooms[room_from]["peers"]:
            return
        
        self.rooms[room_from]["peers"].remove(key)
        del self.peer_joined_at[key]
        del self.peer_room[key]
        del self.all_peers[key]

    async def forward_offer(self , websocket : WebSocket , message : dict):
        # peerId is peer to which we have to send offer
        peerId = message["to"]  
        print(f"peerId in forward offer {peerId}")
        # fetch websocket conn of that peer
        if peerId not in self.all_peers:
            await websocket.send_json({
                "type" : "error" ,
                "message" : "peerId not found in all_peers"
            })
            return False
        
        # ws here is websocket to which we need to send offer
        ws = self.all_peers[peerId]
        if ws:
            await ws.send_json(message)
            return True
        return False
    
    async def forward_answer(self , websocket : WebSocket , message):
        # peerId is peer to which we have to send answer
        peerId = message["to"] 
        # fetch websocket conn of that peer
        if peerId not in self.all_peers:
            await websocket.send_json({
                "type" : "error" ,
                "message" : "peerId not found in all_peers"
            })
            return False

        # ws here is websocket to which we need to send answer
        ws = self.all_peers[peerId]
        if ws:
            await ws.send_json(message)
            return True
        return False
    
    def get_room_info(self, room_id : str):
        if room_id not in self.rooms:
            return {"exists": False, "clients": 0}
        return {
            "exists" : True , 
            "clients" : len(self.rooms[room_id]["peers"]),
            "created_at": self.rooms[room_id]["created_at"].isoformate if self.rooms[room_id]["created_at"] else None
        }
    
    async def broadcast_to_room(self , sender : WebSocket ,message : dict):
        
        peerId = next((k for k , v in self.all_peers.items() if v == sender) , None)
        if not peerId :
            return
        
        if peerId not in self.peer_room:
            print("Sender not found in any peer_room")
            return False
        
        room_id = self.peer_room[peerId]
        if room_id not in self.rooms:
            print("room_id not found in rooms")
            return False
        
        peers = self.rooms[room_id]["peers"]
        for peer in peers:
            ws = self.all_peers[peer]
            if ws and ws != sender:
                await ws.send_json(message)
        print(f"broadcast {message.get("type")} to all peers")
        return True
    
# Create global connection manager instance
manager = ConnectionManager()

# websocket handelers

@app.websocket("/ws/{room_id}")
async def websocket_handler(websocket : WebSocket , room_id : str):
    print("WS HANDLER HIT", room_id, flush=True)
    # Accept the connection
    await manager.accept_connection(websocket, room_id)

    try:
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

            if msg_type == "create":
                rid = message.get("roomId")
                pwd = message.get("pwd")
                print(rid , " " , pwd) 
                if rid and pwd:
                    await manager.create_room(websocket, rid, pwd)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "roomId and password required"
                    })
            
            elif msg_type == "join":
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
                await manager.forward_offer(websocket , message)
            elif msg_type == "answer":
                await manager.forward_answer(websocket , message)
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

# @app.get("/stats")
# async def get_stats():
#     return manager.get_stats()

@app.get("/room/{room_id}")
async def get_room_info(room_id: str):
    return manager.get_room_info(room_id)

if __name__ == "__main__":
    print("Starting P2P File Sharing Signaling Server...")
    print("WebSocket endpoint: ws://localhost:8000/ws/{room_id}")
    print("HTTP endpoints: /, /health, /stats, /room/{room_id}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        log_level="info",
        reload=True
    )