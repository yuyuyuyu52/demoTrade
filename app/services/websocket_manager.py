from typing import Dict, List
from fastapi import WebSocket
import asyncio
import json

class AccountWebSocketManager:
    def __init__(self):
        # account_id -> List[WebSocket]
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, account_id: int):
        await websocket.accept()
        if account_id not in self.active_connections:
            self.active_connections[account_id] = []
        self.active_connections[account_id].append(websocket)
        print(f"WS: Client connected to account {account_id}. Total clients: {len(self.active_connections[account_id])}")

    def disconnect(self, websocket: WebSocket, account_id: int):
        if account_id in self.active_connections:
            if websocket in self.active_connections[account_id]:
                self.active_connections[account_id].remove(websocket)
            if not self.active_connections[account_id]:
                del self.active_connections[account_id]
        print(f"WS: Client disconnected from account {account_id}")

    async def send_personal_message(self, message: dict, account_id: int):
        if account_id in self.active_connections:
            # Broadcast to all connections for this account (e.g. multiple tabs)
            # We clone the list to avoid issues if a client disconnects during iteration
            for connection in list(self.active_connections[account_id]):
                try:
                    await connection.send_json(message)
                except Exception as e:
                    print(f"WS Error sending to {account_id}: {e}")
                    # Usually disconnect() is called by the endpoint handling the 'receive' loop,
                    # but if send fails, we might want to clean up too? 
                    # For now, let the receive loop handle disconnection.

manager = AccountWebSocketManager()
