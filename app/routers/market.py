from fastapi import APIRouter, HTTPException
from app.services.binance_ws import get_all_prices
import aiohttp

router = APIRouter(prefix="/market", tags=["market"])

@router.get("/prices")
async def get_prices():
    return get_all_prices()

@router.get("/klines")
async def get_klines(symbol: str, interval: str, limit: int = 1000):
    # Use Binance Futures API
    url = "https://fapi.binance.com/fapi/v1/klines"
    params = {
        "symbol": symbol,
        "interval": interval,
        "limit": limit
    }
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise HTTPException(status_code=response.status, detail=f"Binance API Error: {error_text}")
                return await response.json()
        except Exception as e:
             raise HTTPException(status_code=500, detail=str(e))
