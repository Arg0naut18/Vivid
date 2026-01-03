from contextlib import asynccontextmanager
from typing import Dict, List, Optional

from fastapi import WebSocket, WebSocketDisconnect

from src.core.logger import setup_logger

logger = setup_logger(__name__)


class Room:
    def __init__(self, password_hash: str):
        self.password_hash = password_hash
        self.connections: List[WebSocket] = []


class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id)

    def create_room(self, room_id: str, password_hash: str) -> Room:
        logger.info(f"Creating room {room_id}")
        new_room = Room(password_hash)
        self.rooms[room_id] = new_room
        return new_room

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            logger.info(f"Deleting room {room_id} (empty)")
            del self.rooms[room_id]

    @asynccontextmanager
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        room = self.get_room(room_id)
        if not room:
            logger.warning(f"Room {room_id} not found during connection")
            await websocket.close(code=1008, reason="Room does not exist")
            # Raise exception to satisfy @asynccontextmanager contract
            raise WebSocketDisconnect(code=1008, reason="Room does not exist")
            
        room.connections.append(websocket)
        logger.info(
            f"Connection added to room {room_id}. Total connections: {len(room.connections)}"
        )
        try:
            yield
        finally:
            if websocket in room.connections:
                room.connections.remove(websocket)
                logger.info(
                    f"Connection removed from room {room_id}. Remaining: {len(room.connections)}"
                )
            if not room.connections:
                self.delete_room(room_id)

    async def broadcast(self, message: str, room_id: str, sender: WebSocket):
        room = self.get_room(room_id)
        if room:
            # Iterate over a copy of connections to safely handle concurrent removals
            for connection in list(room.connections):
                if connection != sender:
                    try:
                        await connection.send_text(message)
                    except Exception as e:
                        logger.warning(f"Failed to send broadcast message: {e}")


room_manager = RoomManager()
