import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import PositionHistory

async def check_history():
    async with AsyncSessionLocal() as session:
        stmt = select(PositionHistory)
        result = await session.execute(stmt)
        rows = result.scalars().all()
        print(f"Total PositionHistory rows: {len(rows)}")
        for row in rows:
            print(f"ID: {row.id}, Symbol: {row.symbol}, PNL: {row.realized_pnl}, ClosedAt: {row.closed_at}")

if __name__ == "__main__":
    asyncio.run(check_history())
