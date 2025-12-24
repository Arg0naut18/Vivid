from typing import Dict, List, Optional
from fastapi import WebSocket
from contextlib import asynccontextmanager

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
        new_room = Room(password_hash)
        self.rooms[room_id] = new_room
        return new_room

    def delete_room(self, room_id: str):
        if room_id in self.rooms:
            del self.rooms[room_id]

    @asynccontextmanager
    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        room = self.get_room(room_id)
        if room:
            room.connections.append(websocket)
            try:
                yield
            finally:
                if websocket in room.connections:
                    room.connections.remove(websocket)
                if not room.connections:
                    self.delete_room(room_id)

    async def broadcast(self, message: str, room_id: str, sender: WebSocket):
        room = self.get_room(room_id)
        if room:
            for connection in room.connections:
                if connection != sender:
                    await connection.send_text(message)

room_manager = RoomManager()
