# 📁 P2P File Sharing

A secure, server‑less file‑sharing web app using WebRTC, FastAPI, and WebSockets.
Direct peer‑to‑peer file transfer with real‑time chat, multi‑peer support, and seamless reconnection.

> 🌐 **Live Demo:** https://p2p-file-sharing-eight.vercel.app
> Deployment: The frontend is hosted on Vercel, while the FastAPI backend and WebSocket signaling server are hosted on Railway.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Features](#features)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Tech Stack](#tech-stack)
- [Usage](#usage)
- [EndPoints](#endpoints)

---

## Project Overview
PeerDrop is a secure browser-based Peer-to-Peer (P2P) file sharing application that enables users to transfer files directly between devices using WebRTC. A FastAPI backend acts as a signaling server for peer discovery and connection setup, while the actual file transfer occurs directly between peers without passing through the server.

## Features

- User registration and login using JWT authentication
- Create password-protected rooms
- Join existing rooms securely
- Direct browser-to-browser file transfer using WebRTC
- Real-time text messaging
- Multi-peer room support
- Handles browser refresh by automatically rejoining the same room and reconnecting to existing peers
- Automatic peer discovery and reconnection
- WebSocket-based signaling server
- Secure password hashing
- PostgreSQL database integration
- Responsive user interface  

---

## Architecture

A hybrid architecture where FastAPI serves as the signaling and authentication server, while WebRTC enables direct peer-to-peer communication for file transfer.



```
┌───────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                                 │
│                      HTML + CSS + JavaScript                              │
│                                                                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                        │
│  │     UI      │  │   WebRTC    │  │  WebSocket  │                        │
│  │  (Login/    │  │  (P2P Data) │  │  (Signaling)│                        │
│  │   Rooms/    │  └─────────────┘  └─────────────┘                        │
│  │   Chat/     │         │                │                               │
│  │   Files)    │         └────────────────┼────────────────┐              │
│  └─────────────┘                          │                │              │
│        │                           WSS (Signaling)  P2P (Data)            │
│        │                                   │                │             │
└────────┼───────────────────────────────────┼────────────────┼─────────────┘
         │                                   │                │
         │ HTTPS                             │                │
         ▼                                   ▼                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                      API GATEWAY (FastAPI - Railway)                      │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │  JWT Validation    │    Route Forwarding    │    CORS Handling     │   │
│  └────────────────────────────────────────────────────────────────────┘   │
│                                    │                                      │
│           ┌────────────────────────┼────────────────────────┐             │
│           │                        │                        │             │
│           ▼                        ▼                        ▼             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐    │
│  │  Auth Service   │  │  Room Service   │  │  WebSocket Signaling    │    │
│  │  - Register     │  │  - Create Room  │  │  - Offer/Answer Relay   │    │
│  │  - Login        │  │  - Join Room    │  │  - ICE Forwarding       │    │
│  │  - JWT Issue    │  │  - Password     │  │  - Peer Discovery       │    │
│  │  - Google OAuth │  │  - Participants │  │  - Reconnection (30s)   │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘    │
│                                    │                                      │
└────────────────────────────────────┼──────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER (PostgreSQL)                            │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐                   │
│  │    users     │  │    rooms     │  │ room_participants│                   │
│  └──────────────┘  └──────────────┘  └──────────────────┘                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  User → Login → JWT Token → localStorage                                    │
│                                                                             │
│  User → Create/Join Room → WebSocket  → Server → Room Added                 │
│                                                                             │
│  Server → Broadcast "new_peer" → All Peers → WebRTC Connection Established  │
│                                                                             │
│  Peer A → File Chunks → WebRTC Data Channel → Peer B → File Downloaded      │
│                                                                             │
│  Peer Disconnects → Server waits 30s → Reconnect → Session Restored         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, JavaScript (ES6) |
| Backend (python) | Python 3.11, FastAPI, Uvicorn, SQLAlchemy |
| Validation | pydantic |
| Communication | WebRTC, WebSocket |
| Security | JWT (jjwt 0.12.6) |
| Database | PostgreSQL |
| Deployment | Frontend: Vercel, Backend: Railway |

---

## Usage

- Register an account.
- Login.
- Create a room.
- Share the Room ID.
- Another user joins the room.
- WebRTC connection is established.
- Transfer files directly.

## EndPoints

### Authentication & Users

| Method | Endpoint | Service | Description |
|---|---|---|---|
| POST | `/auth/register` | user-service | Register a new user |
| POST | `/auth/login` | user-service | Log in and receive a JWT |

### Room

| Method | Endpoint | Service | Description |
|---|---|---|---|
| POST | `/create` | user-service | create new room |
| POST | `/join` | user-service | join room |
| POST | `/leave` | user-service | leave room |

### WebSocket

| Method | Endpoint | Service | Description |
|---|---|---|---|
| WEBSOCKET | `/ws/{room_id}` | Signaling Service | Handles room creation, room joining, peer notifications, WebRTC offer/answer exchange, ICE candidate forwarding, and peer disconnect events. |


