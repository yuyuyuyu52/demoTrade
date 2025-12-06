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

    update_data = position_in.model_dump(exclude_unset=True)
    
    if "take_profit_price" in update_data:
        position.take_profit_price = update_data["take_profit_price"]
    if "stop_loss_price" in update_data:
        new_sl = update_data["stop_loss_price"]
        position.stop_loss_price = new_sl
        
        # Update initial_stop_loss_price if risk increases (Max Risk Logic)
        if new_sl is not None:
            current_risk = abs(position.entry_price - new_sl)
            
            # If no initial SL was set, set it now
            if position.initial_stop_loss_price is None:
                position.initial_stop_loss_price = new_sl
            else:
                stored_risk = abs(position.entry_price - position.initial_stop_loss_price)
                if current_risk > stored_risk:
                    position.initial_stop_loss_price = new_sl

    await db.commit()
    await db.refresh(position)
    return position
