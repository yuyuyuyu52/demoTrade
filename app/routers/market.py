from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from app.services.binance_ws import get_all_prices
import aiohttp
import websockets
import asyncio

router = APIRouter(prefix="/market", tags=["market"])

@router.get("/prices")
async def get_prices():
    return get_all_prices()

from typing import Optional

@router.get("/klines")
async def get_klines(symbol: str, interval: str, limit: int = 1000, endTime: Optional[int] = None):
    # Use Binance Futures API
    url = "https://fapi.binance.com/fapi/v1/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit
    }
    if endTime:
        params["endTime"] = endTime
        
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(status_code=response.status, detail=f"Binance API Error: {error_text}")
                return await response.json()
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/klines/{symbol}/{interval}")
async def websocket_endpoint(websocket: WebSocket, symbol: str, interval: str):
    await websocket.accept()
    ws_symbol = symbol.lower()
    # Use Binance Futures WebSocket
    binance_ws_url = f"wss://fstream.binance.com/ws/{ws_symbol}@kline_{interval}"
    
    try:
        async with websockets.connect(binance_ws_url) as binance_ws:
            # Create a task to forward messages from client to binance (if needed, mostly for ping/pong)
            # But here we mainly just stream from Binance to Client
            
            async for message in binance_ws:
                try:
                    await websocket.send_text(message)
                except Exception:
                    break
    except Exception as e:
        print(f"WebSocket proxy error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass
@router.websocket("/ws/prices")
async def websocket_prices(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            prices = get_all_prices()
            if prices:
                await websocket.send_json(prices)
            await asyncio.sleep(0.5) # Update every 500ms
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Price WebSocket error: {e}")
