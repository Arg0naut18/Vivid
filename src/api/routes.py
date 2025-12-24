from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, status, Depends
from pydantic import BaseModel
from typing import Optional

from src.auth.security import get_password_hash, verify_password, create_access_token, verify_token
from src.services.room_manager import room_manager

router = APIRouter()

class RoomJoinRequest(BaseModel):
    room_id: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str


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
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: Optional[str] = None):
    if not token:
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    
    token_room_id = verify_token(token)
    if token_room_id != room_id:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    room = room_manager.get_room(room_id)
    if not room:
        await websocket.close(code=1008, reason="Room does not exist. Please login again.")
        return
    
    if len(room.connections) >= 2:
        await websocket.close(code=1008, reason="Room full")
        return

    try:
        async with room_manager.connect(websocket, room_id):
            print(f"User joined room {room_id}. Total: {len(room.connections)}")
            while True:
                data = await websocket.receive_text()
                await room_manager.broadcast(data, room_id, websocket)
    except WebSocketDisconnect:
        print(f"User left room {room_id}")
