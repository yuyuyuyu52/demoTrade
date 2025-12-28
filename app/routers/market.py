from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
from app.services.binance_ws import get_all_prices as get_binance_prices
from app.services.coinbase_ws import get_all_coinbase_prices
from app.config import settings
import aiohttp
import websockets
import asyncio
import time
import json
from typing import Optional

router = APIRouter(prefix="/market", tags=["market"])

@router.get("/prices")
async def get_prices():
    binance = get_binance_prices()
    coinbase = get_all_coinbase_prices()
    # Merge dicts
    return {**binance, **coinbase}

# Global session variable
_client_session: Optional[aiohttp.ClientSession] = None

async def get_client_session() -> aiohttp.ClientSession:
    global _client_session
    if _client_session is None or _client_session.closed:
        _client_session = aiohttp.ClientSession()
    return _client_session

COINBASE_INTERVAL_MAP = {
    "1m": "ONE_MINUTE",
    "5m": "FIVE_MINUTE",
    "15m": "FIFTEEN_MINUTE",
    "30m": "THIRTY_MINUTE",
    "1h": "ONE_HOUR",
    "2h": "TWO_HOUR",
    "6h": "SIX_HOUR",
    "1d": "ONE_DAY"
}

@router.get("/klines")
async def get_klines(symbol: str, interval: str, limit: int = 300, endTime: Optional[int] = None, exchange: str = Query("BINANCE")):
    session = await get_client_session()
    
    if exchange.upper() == "COINBASE":
        # Auto-map PERP to USD for legacy/public API compatibility
        if symbol.endswith("-PERP"):
             symbol = symbol.replace("-PERP", "-USD")
             
        url = f"{settings.COINBASE_API_URL}/products/{symbol}/candles"
        # Exchange API (Public) uses integer granularity and list of lists response
        exchange_interval_map = {
            "1m": "60", "5m": "300", "15m": "900", "30m": "1800",
            "1h": "3600", "2h": "7200", "6h": "21600", "1d": "86400"
        }
        granularity = exchange_interval_map.get(interval, "3600")

        # Map symbol if needed. Exchange API uses BTC-USD (hyphen).
        # Frontend sends BTC-USD hopefully.
        
        # approximate limit to time range
        # interval seconds
        seconds_map = {
            "1m": 60, "5m": 300, "15m": 900, "30m": 1800, 
            "1h": 3600, "2h": 7200, "6h": 21600, "1d": 86400
        }
        step = seconds_map.get(interval, 3600)
        
        # Exchange API expects ISO 8601 strings for start/end
        import datetime
        end_ts = time.time()
        
        if endTime:
            end_ts = endTime / 1000
            
        start_ts = end_ts - (limit * step)
        
        # Coinbase Exchange API Limit: 300 candles max
        if limit > 300:
            start_ts = end_ts - (300 * step)
        
        start_iso = datetime.datetime.utcfromtimestamp(start_ts).isoformat()
        end_iso = datetime.datetime.utcfromtimestamp(end_ts).isoformat()
        
        params = {
            "start": start_iso,
            "end": end_iso,
            "granularity": granularity
        }
        
        try:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(status_code=response.status, detail=f"Coinbase API Error: {error_text}")
                data = await response.json()
                
                # Exchange API returns: [[time, low, high, open, close, volume], ...]
                # Indices: 0: time(epoch), 1: low, 2: high, 3: open, 4: close, 5: volume
                
                formatted = []
                for c in data:
                    # c is list [time, low, high, open, close, volume]
                    if isinstance(c, list) and len(c) >= 6:
                        formatted.append([
                            int(c[0]) * 1000, # Time
                            float(c[3]), # Open
                            float(c[2]), # High
                            float(c[1]), # Low
                            float(c[4]), # Close
                            float(c[5])  # Volume
                        ])
                
                # Sort ascending
                formatted.sort(key=lambda x: x[0])
                return formatted
                
        except HTTPException:
            raise
        except Exception as e:
            print(f"Error fetching Coinbase klines: {e}")
            global _client_session
            if _client_session and _client_session.closed:
                _client_session = None
            raise HTTPException(status_code=500, detail=str(e))
            
    else:
        # Use Binance Futures API
        url = "https://fapi.binance.com/fapi/v1/klines"
        params = {
            "symbol": symbol,
            "interval": interval,
            "limit": limit
        }
        if endTime:
            params["endTime"] = endTime
            
        try:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(status_code=response.status, detail=f"Binance API Error: {error_text}")
                return await response.json()
        except Exception as e:
            # If session is closed or other error, try creating a new one next time
            if _client_session and _client_session.closed:
                _client_session = None
            raise HTTPException(status_code=500, detail=str(e))

@router.websocket("/ws/klines/{symbol}/{interval}")
async def websocket_endpoint(websocket: WebSocket, symbol: str, interval: str, exchange: str = "BINANCE"):
    await websocket.accept()
    
    if exchange.upper() == "COINBASE":
        # Auto-map PERP to USD for legacy/public API compatibility
        if symbol.endswith("-PERP"):
             symbol = symbol.replace("-PERP", "-USD")
             
        # Simulate WS by polling REST
        # Interval in seconds
        seconds_map = {
            "1m": 60, "5m": 300, "15m": 900, "30m": 1800, 
            "1h": 3600, "2h": 7200, "6h": 21600, "1d": 86400
        }
        sleep_time = 2 if seconds_map.get(interval, 60) > 2 else 1
        
        try:
            while True:
                # Fetch last 2 candles to be sure we get the latest update
                # We reuse the logic but call helper or just simple request
                # To avoid code dupe, we could extract `get_klines_coinbase` but for now inline simple
                session = await get_client_session()
                url = f"{settings.COINBASE_API_URL}/products/{symbol}/candles"
                
                # Exchange API Granularity (Integer string)
                exchange_interval_map = {
                    "1m": "60", "5m": "300", "15m": "900", "30m": "1800",
                    "1h": "3600", "2h": "7200", "6h": "21600", "1d": "86400"
                }
                granularity = exchange_interval_map.get(interval, "3600")
                
                # ISO Timestamps
                import datetime
                end_ts = time.time()
                # 2 candles worth of time
                start_ts = end_ts - (2 * seconds_map.get(interval, 3600))
                
                start_iso = datetime.datetime.utcfromtimestamp(start_ts).isoformat()
                end_iso = datetime.datetime.utcfromtimestamp(end_ts).isoformat()
                
                params = {"start": start_iso, "end": end_iso, "granularity": granularity}
                
                try:
                    async with session.get(url, params=params) as response:
                        if response.status == 200:
                            data = await response.json()
                            # data is list of lists
                            if data and len(data) > 0 and isinstance(data[0], list):
                                # Get latest (first item in descending list)
                                latest = data[0] 
                                # [time, low, high, open, close, volume]
                                k_obj = {
                                    "t": int(latest[0]) * 1000,
                                    "o": latest[3],
                                    "c": latest[4],
                                    "h": latest[2],
                                    "l": latest[1],
                                    "v": latest[5]
                                }
                                msg = { "k": k_obj }
                                await websocket.send_json(msg)
                except Exception as e:
                    err_str = str(e)
                    if "close message" in err_str or "closed" in err_str:
                        break
                    print(f"Coinbase poll error: {e}")
                
                await asyncio.sleep(sleep_time)

        except WebSocketDisconnect:
            pass
            
    else:
        # Use Binance Futures WebSocket
        ws_symbol = symbol.lower()
        binance_ws_url = f"wss://fstream.binance.com/ws/{ws_symbol}@kline_{interval}"
        
        try:
            async with websockets.connect(binance_ws_url) as binance_ws:
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
            binance = get_binance_prices()
            coinbase = get_all_coinbase_prices()
            merged = {**binance, **coinbase}
            
            if merged:
                await websocket.send_json(merged)
            await asyncio.sleep(0.5) # Update every 500ms
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"Price WebSocket error: {e}")
