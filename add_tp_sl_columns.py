import asyncio
from sqlalchemy import text
from app.database import engine

async def add_columns():
    async with engine.begin() as conn:
        print("Adding columns to positions table...")
        try:
            await conn.execute(text("ALTER TABLE positions ADD COLUMN take_profit_price FLOAT"))
            print("Added take_profit_price to positions")
        except Exception as e:
            print(f"Error adding take_profit_price to positions: {e}")

        try:
            await conn.execute(text("ALTER TABLE positions ADD COLUMN stop_loss_price FLOAT"))
            print("Added stop_loss_price to positions")
        except Exception as e:
            print(f"Error adding stop_loss_price to positions: {e}")

        print("Adding columns to orders table...")
        try:
            await conn.execute(text("ALTER TABLE orders ADD COLUMN take_profit_price FLOAT"))
            print("Added take_profit_price to orders")
        except Exception as e:
            print(f"Error adding take_profit_price to orders: {e}")

        try:
            await conn.execute(text("ALTER TABLE orders ADD COLUMN stop_loss_price FLOAT"))
            print("Added stop_loss_price to orders")
        except Exception as e:
            print(f"Error adding stop_loss_price to orders: {e}")

if __name__ == "__main__":
    asyncio.run(add_columns())
