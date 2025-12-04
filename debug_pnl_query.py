import asyncio
from sqlalchemy import select, func, extract
from app.database import AsyncSessionLocal
from app.models import PositionHistory

async def debug_query():
    async with AsyncSessionLocal() as session:
        account_id = 1
        year = 2025
        month = 12
        
        print(f"Testing query for Account {account_id}, {year}-{month}")
        
        try:
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
            
            result = await session.execute(stmt)
            rows = result.all()
            
            print(f"Query successful. Rows: {len(rows)}")
            for row in rows:
                print(f"Row: {row}")
                print(f"Date type: {type(row.date)}")
                print(f"PNL type: {type(row.pnl)}")
                
        except Exception as e:
            print(f"Query failed: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(debug_query())
