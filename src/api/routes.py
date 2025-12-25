from typing import Optional

import httpx
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from pydantic import BaseModel

from src.auth.security import (
    create_access_token,
    get_password_hash,
    verify_password,
    verify_token,
)
from src.core.config import settings
from src.services.room_manager import room_manager

router = APIRouter()


@router.get("/api/ice-config")
async def get_ice_config():
    """Returns the ICE servers configuration (STUN/TURN)"""
    # 1. Check if Metered.ca is configured
    if settings.TURN_API_KEY and settings.TURN_URL:
        try:
            async with httpx.AsyncClient() as client:
                url = f"{settings.TURN_URL}?apiKey={settings.TURN_API_KEY}"
                response = await client.get(url, timeout=5.0)
                if response.status_code == 200:
                    data = response.json()
                    # Metered might return a list of servers, or an object with iceServers
                    if isinstance(data, list):
                        return {"iceServers": data}
                    return data
                else:
                    pass
        except Exception as e:
            pass
    else:
        # User might be using only static config or default STUN
        pass

    # 2. Fallback to manually configured TURN or just Google STUN
    ice_servers = [
        {"urls": "stun:stun1.l.google.com:19302"},
        {"urls": "stun:stun2.l.google.com:19302"},
    ]

    # Only add TURN_URL as a static server if it's NOT the HTTP API endpoint
    if settings.TURN_URL and not settings.TURN_URL.startswith("http"):
        server = {
            "urls": settings.TURN_URL,
        }
        if settings.TURN_USERNAME:
            server["username"] = settings.TURN_USERNAME
        if settings.TURN_PASSWORD:
            server["credential"] = settings.TURN_PASSWORD
        ice_servers.append(server)

    return {"iceServers": ice_servers}


class RoomJoinRequest(BaseModel):
    room_id: str
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.post("/api/join", response_model=Token)
async def join_room(request: RoomJoinRequest):
    room_id = request.room_id.strip()
    password = request.password.strip()

    if not room_id or not password:
        raise HTTPException(status_code=400, detail="Room ID and Password required")

    room = room_manager.get_room(room_id)

    if not room:
        hashed_pw = get_password_hash(password)
        room_manager.create_room(room_id, hashed_pw)
    else:
        if not verify_password(password, room.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect password for this room",
            )

    access_token = create_access_token(data={"sub": room_id})
    return {"access_token": access_token, "token_type": "bearer"}


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(
    websocket: WebSocket, room_id: str, token: Optional[str] = None
):
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return

    token_room_id = verify_token(token)
    if token_room_id != room_id:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    room = room_manager.get_room(room_id)
    if not room:
        await websocket.close(
            code=1008, reason="Room does not exist. Please login again."
        )
        return

    if len(room.connections) >= 2:
        await websocket.close(code=1008, reason="Room full")
        return

    try:
        async with room_manager.connect(websocket, room_id):
            while True:
                data = await websocket.receive_text()
                await room_manager.broadcast(data, room_id, websocket)
    except WebSocketDisconnect:
        await room_manager.broadcast('{"type": "user-left"}', room_id, websocket)
