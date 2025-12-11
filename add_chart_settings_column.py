
import asyncio
from sqlalchemy import text
from app.database import engine

async def add_column():
    async with engine.begin() as conn:
        try:
            await conn.execute(text("ALTER TABLE accounts ADD COLUMN chart_settings JSON DEFAULT '{}'"))
            print("Column chart_settings added successfully.")
        except Exception as e:
            print(f"Error adding column (might already exist): {e}")

if __name__ == "__main__":
    asyncio.run(add_column())
