from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta

from app.database import get_db
from app.models import Account, Position, EquityHistory, PositionHistory
from app.schemas import AccountResponse, EquityHistoryResponse, PositionHistoryResponse, AccountStatistics, AccountUpdate
import math
import statistics

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

@router.get("/{account_id}/position-history", response_model=list[PositionHistoryResponse])
async def get_position_history(account_id: int, db: AsyncSession = Depends(get_db)):
    stmt = select(PositionHistory).where(PositionHistory.account_id == account_id).order_by(PositionHistory.closed_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.get("/{account_id}/daily-pnl")
async def get_daily_pnl(account_id: int, year: int, month: int, db: AsyncSession = Depends(get_db)):
    # Group by day and sum (realized_pnl - total_fee)
    # Note: SQLite/PostgreSQL date functions might differ. Assuming PostgreSQL or standard SQL.
    # For asyncpg/PostgreSQL:
    date_expr = func.date_trunc('day', PositionHistory.closed_at)
    
    stmt = select(
        date_expr.label('date'),
        func.sum(PositionHistory.realized_pnl - PositionHistory.total_fee).label('pnl')
    ).where(
        PositionHistory.account_id == account_id,
        extract('year', PositionHistory.closed_at) == year,
        extract('month', PositionHistory.closed_at) == month
    ).group_by(
        date_expr
    ).order_by(
        date_expr
    )
    
    result = await db.execute(stmt)
    rows = result.all()
    
    # Debug logging
    print(f"Querying PNL for {year}-{month}, Account: {account_id}")
    print(f"Found {len(rows)} rows")
    for row in rows:
        print(f"Date: {row.date}, PNL: {row.pnl}")

    data = []
    for row in rows:
        date_str = row.date.strftime("%Y-%m-%d") if hasattr(row.date, 'strftime') else str(row.date)[:10]
        data.append({"date": date_str, "pnl": row.pnl})
    return data

@router.get("/{account_id}/statistics", response_model=AccountStatistics)
async def get_account_statistics(account_id: int, db: AsyncSession = Depends(get_db)):
    # Fetch Position History
    stmt = select(PositionHistory).where(PositionHistory.account_id == account_id).order_by(PositionHistory.closed_at.asc())
    result = await db.execute(stmt)
    trades = result.scalars().all()

    # Fetch Equity History
    stmt = select(EquityHistory).where(EquityHistory.account_id == account_id).order_by(EquityHistory.timestamp.asc())
    result = await db.execute(stmt)
    equity_curve = result.scalars().all()

    # Fetch Account for current balance
    stmt = select(Account).where(Account.id == account_id)
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # --- Calculations ---
    
    # 1. Trade Statistics
    total_trades = len(trades)
    wins = [t for t in trades if t.realized_pnl > 0]
    losses = [t for t in trades if t.realized_pnl <= 0]
    
    win_rate = len(wins) / total_trades if total_trades > 0 else 0.0
    
    avg_win = statistics.mean([t.realized_pnl for t in wins]) if wins else 0.0
    avg_loss = statistics.mean([t.realized_pnl for t in losses]) if losses else 0.0
    
    gross_profit = sum([t.realized_pnl for t in wins])
    gross_loss = abs(sum([t.realized_pnl for t in losses]))
    
    profit_factor = gross_profit / gross_loss if gross_loss > 0 else (float('inf') if gross_profit > 0 else 0.0)
    
    # Expectancy = (Win Rate * Avg Win) + (Loss Rate * Avg Loss)  <-- Avg Loss is usually negative
    loss_rate = 1.0 - win_rate
    expectancy = (win_rate * avg_win) + (loss_rate * avg_loss)

    # 2. Equity Statistics (Drawdown, Sharpe, CAGR)
    max_drawdown = 0.0
    max_drawdown_pct = 0.0
    peak_equity = 0.0
    
    # If no equity history, try to reconstruct from trades + initial balance? 
    # For now, rely on equity_history. If empty, use current balance as single point.
    
    equity_values = [e.equity for e in equity_curve]
    if not equity_values and account:
        equity_values = [account.balance] # Fallback
        
    if equity_values:
        peak_equity = equity_values[0]
        for eq in equity_values:
            if eq > peak_equity:
                peak_equity = eq
            
            dd = peak_equity - eq
            dd_pct = (dd / peak_equity) if peak_equity > 0 else 0.0
            
            if dd > max_drawdown:
                max_drawdown = dd
            if dd_pct > max_drawdown_pct:
                max_drawdown_pct = dd_pct

    # Sharpe Ratio
    # Need daily returns. 
    # We can approximate by grouping equity history by day, or just using the points we have if they are daily.
    # Assuming equity_history is recorded frequently, we should resample to daily.
    # For simplicity here, we'll calculate returns based on the available data points if they span enough time.
    
    sharpe_ratio = 0.0
    if len(equity_values) > 1:
        returns = []
        for i in range(1, len(equity_values)):
            prev = equity_values[i-1]
            curr = equity_values[i]
            if prev > 0:
                ret = (curr - prev) / prev
                returns.append(ret)
        
        if returns and len(returns) > 1:
            mean_ret = statistics.mean(returns)
            stdev_ret = statistics.stdev(returns)
            if stdev_ret > 0:
                # Annualize (assuming daily data points roughly)
                # If data is not daily, this needs adjustment. 
                # Let's assume the equity recorder runs daily or we just take the sequence as "periods"
                sharpe_ratio = (mean_ret / stdev_ret) * math.sqrt(365) 

    # CAGR
    cagr = 0.0
    if equity_curve:
        start_date = equity_curve[0].timestamp
        end_date = equity_curve[-1].timestamp
        start_val = equity_curve[0].equity
        end_val = equity_curve[-1].equity
        
        days = (end_date - start_date).days
        if days > 0 and start_val > 0:
            years = days / 365.0
            try:
                cagr = (end_val / start_val) ** (1 / years) - 1
            except:
                cagr = 0.0
    
    return AccountStatistics(
        max_drawdown=max_drawdown,
        max_drawdown_pct=max_drawdown_pct,
        expectancy=expectancy,
        profit_factor=profit_factor,
        sharpe_ratio=sharpe_ratio,
        cagr=cagr,
        win_rate=win_rate,
        total_trades=total_trades,
        average_win=avg_win,
        average_loss=avg_loss
    )

@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(account_id: int, update_data: AccountUpdate, db: AsyncSession = Depends(get_db)):
    stmt = select(Account).where(Account.id == account_id)
    result = await db.execute(stmt)
    account = result.scalar_one_or_none()
    
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    account.leverage = update_data.leverage
    await db.commit()
    await db.refresh(account)
    
    return await calculate_account_metrics(account)

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
