from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Order, Account, OrderType, OrderStatus
from app.schemas import OrderCreate, OrderResponse, OrderUpdate
from app.services.websocket_manager import manager


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
        limit_price=order_in.price if order_in.order_type == OrderType.LIMIT else None,
        price=0.0,
        leverage=order_in.leverage,
        take_profit_price=order_in.take_profit_price,
        stop_loss_price=order_in.stop_loss_price,
        status=OrderStatus.NEW
    )
    db.add(new_order)
    await db.commit()
    await db.refresh(new_order)

    # Notify
    await manager.send_personal_message({"type": "ACCOUNT_UPDATE"}, order_in.account_id)

    # If Market Order, the matching engine will pick it up automatically
    # We do NOT execute it here to avoid race conditions and double execution
    # if the background task picks it up at the same time.
    
    return new_order

@router.get("/", response_model=List[OrderResponse])
async def list_orders(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Order).where(Order.account_id == account_id)
    result = await db.execute(stmt)
    return result.scalars().all()

@router.delete("/{order_id}", response_model=OrderResponse)
async def cancel_order(order_id: int, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Allow cancelling NEW and PARTIALLY_FILLED orders
    if order.status not in [OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED]:
        raise HTTPException(status_code=400, detail="Order cannot be cancelled")

    order.status = OrderStatus.CANCELED
    await db.commit()
    await db.refresh(order)
    
    # Notify
    await manager.send_personal_message({"type": "ACCOUNT_UPDATE"}, order.account_id)
    
    return order

@router.patch("/{order_id}", response_model=OrderResponse)
async def update_order(order_id: int, order_update: OrderUpdate, db: AsyncSession = Depends(get_db)):
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Allow updating NEW and PARTIALLY_FILLED orders
    if order.status not in [OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED]:
        raise HTTPException(status_code=400, detail="Cannot update order that is not NEW or PARTIALLY_FILLED")

    # Limit Price and Quantity usually shouldn't be changed if partially filled, 
    # but for simplicity we allow it or restrict it only for NEW. 
    # Let's restrict core parameters to NEW only to strictly follow standard exchange logic,
    # but allow TP/SL for both.
    
    if order.status == OrderStatus.NEW:
        if order_update.price is not None:
            order.limit_price = order_update.price
        
        if (order_update.quantity is not None):
            order.quantity = order_update.quantity

    if (order_update.take_profit_price is not None):
        order.take_profit_price = order_update.take_profit_price

    if (order_update.stop_loss_price is not None):
        order.stop_loss_price = order_update.stop_loss_price

    await db.commit()
    await db.refresh(order)
    
    # Notify
    await manager.send_personal_message({"type": "ACCOUNT_UPDATE"}, order.account_id)
    
    return order
