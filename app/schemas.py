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
    take_profit_price: Optional[float] = None
    stop_loss_price: Optional[float] = None

class OrderResponse(BaseModel):
    id: int
    account_id: int
    symbol: str
    side: OrderSide
    order_type: OrderType
    limit_price: Optional[float]
    price: float
    quantity: float
    filled_quantity: float
    fee: float
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
    id: int
    symbol: str
    quantity: float
    entry_price: float
    leverage: int
    margin: float
    liquidation_price: float
    take_profit_price: Optional[float] = None
    stop_loss_price: Optional[float] = None
    unrealized_pnl: Optional[float] = 0.0
    created_at: datetime

    class Config:
        from_attributes = True

class PositionUpdate(BaseModel):
    take_profit_price: Optional[float] = None
    stop_loss_price: Optional[float] = None

class PositionHistoryResponse(BaseModel):
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    leverage: int
    realized_pnl: float
    total_fee: float
    created_at: datetime
    closed_at: datetime

    class Config:
        from_attributes = True

class AccountResponse(BaseModel):
    id: int
    user_id: str
    balance: float
    leverage: int
    equity: Optional[float] = 0.0
    unrealized_pnl: Optional[float] = 0.0
    positions: List[PositionResponse] = []

    class Config:
        from_attributes = True

class AccountUpdate(BaseModel):
    leverage: int

class AccountStatistics(BaseModel):
    max_drawdown: float
    max_drawdown_pct: float
    expectancy: float
    profit_factor: float
    sharpe_ratio: float
    cagr: float
    win_rate: float
    total_trades: int
    average_win: float
    average_loss: float

    class Config:
        from_attributes = True
