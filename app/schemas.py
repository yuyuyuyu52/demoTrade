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
    id: int
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
    last_timeframe: Optional[str] = "1h"
    last_quantity: Optional[float] = 0.01
    chart_settings: Optional[dict] = {}
    equity: Optional[float] = 0.0
    unrealized_pnl: Optional[float] = 0.0
    positions: List[PositionResponse] = []

    class Config:
        from_attributes = True

class AccountUpdate(BaseModel):
    leverage: Optional[int] = None
    last_timeframe: Optional[str] = None
    last_quantity: Optional[float] = None
    chart_settings: Optional[dict] = None

class AccountStatistics(BaseModel):
    max_drawdown: float
    max_drawdown_pct: float
    expectancy: float
    profit_factor: float
    long_profit_factor: float
    short_profit_factor: float
    reward_to_risk_ratio: float
    sharpe_ratio: float
    cagr: float
    win_rate: float
    total_trades: int
    average_win: float
    average_loss: float
    max_win_streak: int
    max_loss_streak: int

    class Config:
        from_attributes = True

class DrawingCreate(BaseModel):
    account_id: int
    symbol: str
    type: str
    data: dict

class DrawingUpdate(BaseModel):
    data: Optional[dict] = None

class DrawingResponse(BaseModel):
    id: int
    account_id: int
    symbol: str
    type: str
    data: dict
    created_at: datetime

    class Config:
        from_attributes = True

class OrderUpdate(BaseModel):
    price: Optional[float] = None
    quantity: Optional[float] = None
    take_profit_price: Optional[float] = None
    stop_loss_price: Optional[float] = None
