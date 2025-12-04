from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models import OrderSide, OrderType, OrderStatus

class OrderCreate(BaseModel):
    account_id: int
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None
    leverage: int = 1

class OrderResponse(BaseModel):
    id: int
    account_id: int
    symbol: str
    side: OrderSide
    order_type: OrderType
    price: Optional[float]
    quantity: float
    filled_quantity: float
    status: OrderStatus
    leverage: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class EquityHistoryResponse(BaseModel):
    timestamp: datetime
    equity: float

    class Config:
        from_attributes = True

class PositionResponse(BaseModel):
    symbol: str
    quantity: float
    entry_price: float
    leverage: int
    margin: float
    liquidation_price: float
    unrealized_pnl: Optional[float] = 0.0

    class Config:
        from_attributes = True

class AccountResponse(BaseModel):
    id: int
    user_id: str
    balance: float
    equity: Optional[float] = 0.0
    unrealized_pnl: Optional[float] = 0.0
    positions: List[PositionResponse] = []

    class Config:
        from_attributes = True
