from fastapi import WebSocket
from typing import Dict, List
import asyncio
from datetime import datetime
import json

class ConnectionManager():
    def __init__(self):
        # peerId -> WebSocket
        self.peer_connection: Dict[str, WebSocket] = {}
        # WebSocket -> peerId 
        self.all_peers: Dict[WebSocket, str] = {}
        # peerId -> room_id 
        self.peer_room: Dict[str, str] = {}
        # room_id -> {"peers": [peerId], "pending_offers": {peerId: offer_data}, "created_at": timestamp}
        self.rooms: Dict[str, Dict] = {}
        #peerId -> bool
        self.peer_names : Dict[str , str] = {}
        self.reconnecting_peers: Dict[str, asyncio.Task] = {}  # peerId -> cleanup_task
        self.reconnect_timeout = 30  # seconds

    async def create_room(self, websocket: WebSocket, room_id: str,peer_name : str, peerId: str) -> bool:
        if room_id in self.rooms:
            await websocket.send_json({
                "type": "error",
                "message": "Room already exists"
            })
            return False

        # Set all data for new room
        self.peer_connection[peerId] = websocket
        self.all_peers[websocket] = peerId
        self.peer_names[peerId] = peer_name
        self.rooms[room_id] = {
            "peers": [peerId],
            "pending_offers": {}, 
            "created_at": datetime.now() 
        }
        self.peer_room[peerId] = room_id

        print("((((((((((((()))))))))))))")
        print(f" Room {room_id} created by {peerId}")
        print(f" Peers in {room_id}: {len(self.rooms[room_id]['peers'])}")

        await websocket.send_json({
            "type": "created",
            "roomId": room_id,
            "peerId": peerId
        })

        return True

    async def join_room(self, websocket: WebSocket, room_id: str,peer_name : str, peerId: str) -> bool:
        # Check room exists
        if room_id not in self.rooms:
            await websocket.send_json({
                "type": "error",
                "message": f"Room {room_id} doesn't exist"
            })
            return False

        # Check room limit
        if len(self.rooms[room_id]["peers"]) >= 10:
            await websocket.send_json({
                "type": "error",
                "message": "Room is full"
            })
            return False

        # Join new peer
        self.peer_connection[peerId] = websocket
        self.all_peers[websocket] = peerId
        self.peer_room[peerId] = room_id
        self.peer_names[peerId] = peer_name
        existing_peers = self.rooms[room_id]["peers"]

        print("((((((((((((()))))))))))))")
        print(f" Peer {peerId} joined room {room_id}")
        print(f" Peers in {room_id}: {len(existing_peers) + 1}")

        # Send confirmation to new peer
        await websocket.send_json({
            "type": "joined",
            "roomId": room_id,
            "peerId": peerId
        })

        print(existing_peers)
        return True
    async def initializing(self , websocket : WebSocket , peerId : str , room_id : str):
        existing_peers = self.rooms[room_id]["peers"]
        print("in initializing")
        print(existing_peers)
        except_me = []
        peers_names = []
        for peer in existing_peers:
            if peer != peerId:
                except_me.append(peer)
                peers_names.append(self.peer_names[peer])
        print(except_me)
        if except_me:
            await websocket.send_json({
                "type": "already_joined_peers",
                "peers": except_me,
                "peer_names" : peers_names
             })

        for peer in except_me:
            print(self.all_peers)
            if peer in self.peer_connection:
                ws = self.peer_connection[peer]
                await ws.send_json({
                    "type" : "new_peer",
                    "new_peerId" : peerId,
                    "new_peerName" : self.peer_names[peerId] 
                })
        return True

    async def accept_connection(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        print(f" WebSocket accepted for potential room: {room_id}")

    async def rejoin(self, websocket: WebSocket, message: dict):
        peerId = message.get("userId")
        room_id = message.get("roomId")
        
        if not peerId or not room_id:
            return

        if peerId in self.peer_connection:
            ws = self.peer_connection[peerId]
            if ws in self.all_peers:
                print(f"{peerId} websocket removed")
                del self.all_peers[ws]
            del self.peer_connection[peerId]

        print(f" Peer {peerId} attempting to rejoin room {room_id}")

        # Cancel any pending cleanup task
        if peerId in self.reconnecting_peers:
            self.reconnecting_peers[peerId].cancel()
            del self.reconnecting_peers[peerId]

        # Restore connection
        self.peer_connection[peerId] = websocket
        self.all_peers[websocket] = peerId
        self.peer_room[peerId] = room_id
        
        # Notify others that peer is offline
        await self.broadcast_to_room(websocket, {
            "type": "peer_left",
            "peerId": peerId,
            "peer_name" : self.peer_names[peerId],
            "message": f"Peer {peerId} disconnected (may reconnect)"
        })

        # Check if still in room
        if room_id in self.rooms:
            if peerId not in self.rooms[room_id]["peers"]:
                # Re-add if missing
                print("-----------&***")
                self.rooms[room_id]["peers"].append(peerId)

        await self.initializing(websocket , peerId , room_id)

        print(f" Peer {peerId} successfully reconnected to room {room_id}")

    async def disconnect(self, websocket: WebSocket):
        # Get peerId from WebSocket
        peerId = self.all_peers.get(websocket)
        
        if not peerId:
            print(" Disconnect: peerId not found")
            return

        print(f" Peer {peerId} disconnected")

        # Remove from all_peers immediately (WebSocket is dead)
        if websocket in self.all_peers:
            print(f"{websocket} is removed")
            del self.all_peers[websocket]

        if peerId in self.peer_connection:
            print(f"{websocket} is removed")
            del self.peer_connection[peerId]

        # Check if peer is in a room
        room_id = self.peer_room.get(peerId)
        if not room_id or room_id not in self.rooms:
            print(f" Peer {peerId} not in any room, cleaning up")
            self._cleanup_peer(peerId)
            return

        # Start reconnection timer
        if peerId not in self.reconnecting_peers:
            task = asyncio.create_task(self._reconnection_timeout(peerId, room_id))
            self.reconnecting_peers[peerId] = task

        print(f" Peer {peerId} has {self.reconnect_timeout}s to reconnect")

    async def _reconnection_timeout(self, peerId: str, room_id: str):
        await asyncio.sleep(self.reconnect_timeout)

        # Check if peer reconnected (has WebSocket)
        if peerId in self.peer_connection:
            print(f" Peer {peerId} reconnected before timeout")
            return

        # No reconnection - permanent cleanup
        print(f"🗑️ Peer {peerId} did not reconnect, cleaning up")
        
        # Notify others
        if room_id in self.rooms:
            await self.broadcast_to_room(None, {  # None = broadcast to all
                "type": "peer_left",
                "peerId": peerId,
                "peer_name" : self.peer_names[peerId],
                "message": f"Peer {peerId} left permanently"
            })
        
        self._cleanup_peer(peerId)
        
        # Clean up room if empty
        if room_id in self.rooms and not self.rooms[room_id]["peers"]:
            del self.rooms[room_id]
            print(f"🗑️ Room {room_id} deleted (empty)")

        # Remove from reconnecting_peers
        if peerId in self.reconnecting_peers:
            del self.reconnecting_peers[peerId]

    def _cleanup_peer(self, peerId: str):
        """Clean up peer data permanently"""
        room_id = self.peer_room.get(peerId)
        
        # Remove from room
        if room_id and room_id in self.rooms:
            if peerId in self.rooms[room_id]["peers"]:
                self.rooms[room_id]["peers"].remove(peerId)

        # Remove from all mappings
        peer_name = self.peer_names[peerId]
        self.peer_names.pop(peer_name,None)
        self.peer_room.pop(peerId, None)
        self.peer_connection.pop(peerId, None)
        
        # Remove pending offer if any
        if room_id and room_id in self.rooms:
            self.rooms[room_id]["pending_offers"].pop(peerId, None)

    async def forward_offer(self, websocket: WebSocket, message: dict) -> bool:
        """Forward WebRTC offer to specific peer"""
        target_peer_id = message.get("to")
        if not target_peer_id:
            return False

        sender_id = message.get("to")
        if not sender_id:
            return False

        print(f"📤 Forwarding offer to peer: {target_peer_id}")

        # Send to target peer
        target_ws = self.peer_connection[target_peer_id]
        if target_ws:
            await target_ws.send_json(message)
            return True

        return False

    async def forward_answer(self, websocket: WebSocket, message: dict) -> bool:
        """Forward WebRTC answer to specific peer"""
        target_peer_id = message.get("to")
        if not target_peer_id:
            return False

        print(f"📤 Forwarding answer to peer: {target_peer_id}")

        if target_peer_id not in self.peer_connection:
            print(f"⚠️ Target peer {target_peer_id} not connected")
            return False

        target_ws = self.peer_connection[target_peer_id]
        if target_ws:
            await target_ws.send_json(message)
            return True

        return False

    async def broadcast_to_room(self, sender: WebSocket, message: dict):
        """Broadcast message to all peers in sender's room"""
        
        # If sender is None, broadcast to all in room (for system messages)
        if sender is None:
            # Need peerId from message
            peer_id = message.get("peerId")
            room_id = self.peer_room.get(peer_id)
            if not room_id or room_id not in self.rooms:
                return
            
            peers = self.rooms[room_id]["peers"]
            for peer in peers:
                ws = self.peer_connection.get(peer)
                if ws:
                    await ws.send_json(message)
            return

        # Normal broadcast from sender
        peerId = self.all_peers.get(sender)
        if not peerId:
            return

        room_id = self.peer_room.get(peerId)
        if not room_id or room_id not in self.rooms:
            return

        peers = self.rooms[room_id]["peers"]

        msg_type = message.get("type")
        print(f"📨 Broadcasting {msg_type} to room {room_id}")
    
        for peer in peers:
            if peer != peerId:
                ws = self.peer_connection.get(peer)
                if ws:
                    await ws.send_json(message)

    def get_room_info(self, room_id: str):
        """Get room information"""
        if room_id not in self.rooms:
            return {"exists": False, "clients": 0}

        room = self.rooms[room_id]
        created_at = room.get("created_at")
        
        return {
            "exists": True,
            "clients": len(room.get("peers", [])),
            "created_at": created_at.isoformat() if created_at else None
        }