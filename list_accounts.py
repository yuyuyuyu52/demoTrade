import asyncio
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Account

async def list_accounts():
    async with AsyncSessionLocal() as session:
        stmt = select(Account)
        result = await session.execute(stmt)
        accounts = result.scalars().all()
        print(f"Found {len(accounts)} accounts:")
        for acc in accounts:
            print(f"ID: {acc.id}, UserID: {acc.user_id}, Balance: {acc.balance}")

if __name__ == "__main__":
    asyncio.run(list_accounts())
