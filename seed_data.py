import asyncio
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import AsyncSessionLocal
from app.models import Account, PositionHistory

async def seed_data():
    async with AsyncSessionLocal() as session:
        users_to_seed = ["test_user", "3"]
        
        for user_id in users_to_seed:
            # Find or create account
            from sqlalchemy import select
            stmt = select(Account).where(Account.user_id == user_id)
            result = await session.execute(stmt)
            account = result.scalar_one_or_none()
            
            if not account:
                print(f"Account for {user_id} not found. Creating it...")
                account = Account(user_id=user_id, balance=10000.0)
                session.add(account)
                await session.commit()
                await session.refresh(account)

            print(f"Seeding data for account {account.id} (User: {user_id})...")
            
            # Create some position history for current month
            today = datetime.now(timezone.utc)
            
            histories = [
                PositionHistory(
                    account_id=account.id,
                    symbol="BTCUSDT",
                    side="LONG",
                    quantity=0,
                    entry_price=30000,
                    exit_price=31000,
                    leverage=10,
                    realized_pnl=1000,
                    total_fee=10,
                    created_at=today - timedelta(days=2),
                    closed_at=today - timedelta(days=2)
                ),
                PositionHistory(
                    account_id=account.id,
                    symbol="ETHUSDT",
                    side="SHORT",
                    quantity=0,
                    entry_price=2000,
                    exit_price=2100,
                    leverage=10,
                    realized_pnl=-500,
                    total_fee=5,
                    created_at=today - timedelta(days=1),
                    closed_at=today - timedelta(days=1)
                ),
                 PositionHistory(
                    account_id=account.id,
                    symbol="SOLUSDT",
                    side="LONG",
                    quantity=0,
                    entry_price=100,
                    exit_price=110,
                    leverage=5,
                    realized_pnl=200,
                    total_fee=2,
                    created_at=today,
                    closed_at=today
                )
            ]
            
            session.add_all(histories)
            await session.commit()
        
        print("Seeding complete.")

if __name__ == "__main__":
    asyncio.run(seed_data())
