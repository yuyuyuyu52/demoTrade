import asyncio
from app.database import init_db

async def main():
    print("Creating tables...")
    await init_db()
    print("Tables created.")

if __name__ == "__main__":
    asyncio.run(main())
