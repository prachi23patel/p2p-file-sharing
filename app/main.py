from fastapi import FastAPI 
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from app.database import Base, engine
from app.routers import auth , rooms , users , websocket
from app.routers.connection_manager import ConnectionManager

app = FastAPI(title="P2P File Sharing Signaling Server")

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://peer-to-peer-file-sharing.vercel.app",
                     "http://127.0.0.1:5500",         # Local development
                     "http://localhost:8000"],          # Local backend]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)   
# Create global connection manager instance
manager = ConnectionManager()

# websocket handelers

Base.metadata.create_all(bind=engine)
# It reads all ORM models from Base.metadata and creates corresponding tables in the connected database.
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(websocket.router)
app.include_router(rooms.router)

if __name__ == "__main__":
    print("Starting P2P File Sharing Signaling Server...")
    print("WebSocket endpoint: ws://localhost:8000/ws/{room_id}")
    print("HTTP endpoints: /, /health, /stats, /room/{room_id}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info",
        reload=True
    )