from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Position
from app.schemas import PositionResponse, PositionUpdate

router = APIRouter(prefix="/positions", tags=["positions"])

@router.patch("/{position_id}", response_model=PositionResponse)
async def update_position(position_id: int, position_in: PositionUpdate, db: AsyncSession = Depends(get_db)):
    position = await db.get(Position, position_id)
    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    if position_in.take_profit_price is not None:
        position.take_profit_price = position_in.take_profit_price
    if position_in.stop_loss_price is not None:
        position.stop_loss_price = position_in.stop_loss_price

    await db.commit()
    await db.refresh(position)
    return position
