from fastapi import APIRouter
from app.services.binance_ws import get_all_prices

router = APIRouter(prefix="/market", tags=["market"])

@router.get("/prices")
async def get_prices():
    return get_all_prices()
