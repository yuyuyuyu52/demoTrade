from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Account, Position, EquityHistory
from app.schemas import AccountResponse, EquityHistoryResponse

from app.services.binance_ws import get_current_price

router = APIRouter(prefix="/accounts", tags=["accounts"])

@router.post("/", response_model=AccountResponse)
async def create_account(user_id: str, initial_balance: float = 10000.0, db: AsyncSession = Depends(get_db)):
    # Check if account already exists
    stmt = select(Account).where(Account.user_id == user_id)
    result = await db.execute(stmt)
    existing_account = result.scalar_one_or_none()
    
    if existing_account:
        # If exists, return existing account (with positions loaded)
        stmt = select(Account).options(selectinload(Account.positions)).where(Account.id == existing_account.id)
        result = await db.execute(stmt)
        acc = result.scalar_one()
        return await calculate_account_metrics(acc)

    new_account = Account(user_id=user_id, balance=initial_balance)
    db.add(new_account)
    await db.commit()
    await db.refresh(new_account)
    
    # Explicitly load positions to avoid lazy loading error in async context
    stmt = select(Account).options(selectinload(Account.positions)).where(Account.id == new_account.id)
    result = await db.execute(stmt)
    new_account = result.scalar_one()
    return await calculate_account_metrics(new_account)

@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).options(selectinload(Account.positions)).where(Account.id == account_id)
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return await calculate_account_metrics(account)
@router.get("/{account_id}/equity-history", response_model=list[EquityHistoryResponse])
async def get_equity_history(account_id: int, db: AsyncSession = Depends(get_db)):
    # Filter for last 12 hours
    since = datetime.utcnow() - timedelta(hours=12)
    stmt = select(EquityHistory).where(
        EquityHistory.account_id == account_id,
        EquityHistory.timestamp >= since
    ).order_by(EquityHistory.timestamp.asc())
    result = await db.execute(stmt)
    return result.scalars().all()

async def calculate_account_metrics(account: Account) -> Account:
    total_unrealized_pnl = 0.0
    total_margin_used = 0.0
    
    for pos in account.positions:
        total_margin_used += pos.margin
        current_price = get_current_price(pos.symbol)
        if current_price:
            # PNL = (Mark Price - Entry Price) * Quantity (for Long)
            # PNL = (Entry Price - Mark Price) * Abs(Quantity) (for Short)
            # Since Quantity is negative for Short, we can just use:
            # PNL = (Mark Price - Entry Price) * Quantity
            # Example Long: (200 - 100) * 1 = 100
            # Example Short: (200 - 100) * -1 = -100 (Loss)
            # Example Short: (50 - 100) * -1 = 50 (Profit)
            pos.unrealized_pnl = (current_price - pos.entry_price) * pos.quantity
            total_unrealized_pnl += pos.unrealized_pnl
        else:
            pos.unrealized_pnl = 0.0
            
    account.unrealized_pnl = total_unrealized_pnl
    account.equity = account.balance + total_margin_used + total_unrealized_pnl
    return account
