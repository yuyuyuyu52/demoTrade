import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Account, PositionHistory

async def check_data():
    async with AsyncSessionLocal() as session:
        # Check Accounts
        print("--- Accounts ---")
        stmt = select(Account)
        result = await session.execute(stmt)
        accounts = result.scalars().all()
        for acc in accounts:
            print(f"ID: {acc.id}, UserID: {acc.user_id}")

        # Check PositionHistory
        print("\n--- PositionHistory ---")
        stmt = select(PositionHistory)
        result = await session.execute(stmt)
        history = result.scalars().all()
        for h in history:
            print(f"ID: {h.id}, AccountID: {h.account_id}, Date: {h.closed_at}, PNL: {h.realized_pnl}")

if __name__ == "__main__":
    asyncio.run(check_data())
