import asyncio
from sqlalchemy import text
from app.database import get_db
from app.models import Account

async def check():
    async for session in get_db():
        # Check tables
        try:
            result = await session.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';"))
            tables = result.scalars().all()
            print("Tables:", tables)
            
            if 'drawings' in tables:
                print("Drawings table exists.")
            else:
                print("Drawings table MISSING.")
                
            # Check Account 1
            acc = await session.get(Account, 1)
            if acc:
                print(f"Account 1 exists: {acc.user_id}")
            else:
                print("Account 1 NOT found.")
                
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(check())
