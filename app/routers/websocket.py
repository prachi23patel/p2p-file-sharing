from fastapi import FastAPI ,APIRouter, WebSocket , WebSocketDisconnect , Request ,Depends
import json , traceback
from datetime import datetime
from app.routers.connection_manager import ConnectionManager

manager = ConnectionManager()
router = APIRouter()

@router.websocket("/ws/{room_id}")
async def websocket_handler(websocket : WebSocket , room_id : str):
    print("WS HANDLER HIT", room_id, flush=True)
    # Accept the connection
    await manager.accept_connection(websocket, room_id)

    try:
        while True:
            
            try:
                # Try to receive message
                message = await websocket.receive_json()
                # Process message...
                print(f"Received: {message}")
                
            except WebSocketDisconnect as e:
                # Client disconnected - handle it
                print("------------")
                print(f"Client disconnected with code: {e.code}")
                print("-------------")
                # Handle cleanup
                await manager.disconnect(websocket)
                break  # Exit the loop
                
            except Exception as e:
                print(f"Unexpected error: {e}")
                continue  # Continue listening

            msg_type = message.get("type")
            if not msg_type:
                await websocket.send_json({
                    "type": "error",
                    "message": "Missing 'type' field"
                })
                continue

            if msg_type == "create":
                rid = message.get("roomId")
                peer_name = message.get("my_name")
                peerId = message.get("myId")
                if rid and  peerId:
                    await manager.create_room(websocket, rid ,peer_name, peerId)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": "roomId and password required"
                    })
            
            elif msg_type == "join":
                
                rid = message.get("roomId")
                peer_name = message.get("my_name")
                peerId = message.get("myId")
                if rid and  peerId:
                    await manager.join_room(websocket, rid,peer_name ,  peerId)
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
            elif msg_type == "rejoin":
                print("in rejoin")
                await manager.rejoin(websocket , message)
            elif msg_type == "leave":
                await manager.disconnect(websocket)
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
        print(f"🔌 WebSocket disconnected" )
        traceback.print_exc()
        await manager.disconnect(websocket)
    
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        traceback.print_exc()
        await manager.disconnect(websocket)

@router.get("/")
async def root(request : Request):
    host = request.headers["host"]
    return {
        "service": "P2P File Sharing Signaling Server",
        "status": "running",
        "version": "1.0.0",
        "websocket_endpoint": f"wss://{host}/ws/{{room_id}}"
    }

@router.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

# @app.get("/stats")
# async def get_stats():
#     return manager.get_stats()

@router.get("/room/{room_id}")
async def get_room_info(room_id: str):
    return manager.get_room_info(room_id)


