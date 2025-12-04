import asyncio
from sqlalchemy import text
from app.database import engine

async def add_column():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE accounts ADD COLUMN leverage INTEGER DEFAULT 20"))
            print("Added leverage column to accounts table.")
        except Exception as e:
            print(f"Column might already exist or error: {e}")

if __name__ == "__main__":
    asyncio.run(add_column())
