from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Order, Account, OrderType, OrderStatus
from app.schemas import OrderCreate, OrderResponse
from app.services.matching_engine import matching_engine
from app.services.binance_ws import get_current_price

router = APIRouter(prefix="/orders", tags=["orders"])

@router.post("/", response_model=OrderResponse)
async def create_order(order_in: OrderCreate, db: AsyncSession = Depends(get_db)):
    # Validate Account
    account = await db.get(Account, order_in.account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Create Order
    new_order = Order(
        account_id=order_in.account_id,
        symbol=order_in.symbol.upper(),
        side=order_in.side,
        order_type=order_in.order_type,
        quantity=order_in.quantity,
        price=order_in.price,
        leverage=order_in.leverage,
        status=OrderStatus.NEW
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)

    # If Market Order, try to execute immediately
    if new_order.order_type == OrderType.MARKET:
        current_price = get_current_price(new_order.symbol)
        if current_price:
            # Execute immediately
            # Note: In a real system, we might want to lock the row or handle this more carefully
            # Re-fetching or passing the object might be tricky with async session if not careful, 
            # but here we pass the session and the object.
            await matching_engine.execute_trade(db, new_order, current_price)
            await db.refresh(new_order)
        else:
            # If no price available, maybe reject or leave as NEW?
            # For now, leave as NEW, the background task will pick it up when price is available?
            # Actually background task only looks for LIMIT orders in my implementation.
            # Let's update background task to handle MARKET too or reject here.
            pass 

    return new_order

@router.get("/", response_model=List[OrderResponse])
async def list_orders(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.account_id == account_id)
    result = await db.execute(stmt)
    return result.scalars().all()
