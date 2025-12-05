import asyncio
from sqlalchemy import select, delete
from app.database import AsyncSessionLocal
from app.models import EquityHistory
import sys

async def list_and_clean_equity():
    async with AsyncSessionLocal() as session:
        # Check if an ID is provided for deletion
        if len(sys.argv) > 1:
            try:
                delete_id = int(sys.argv[1])
                stmt = delete(EquityHistory).where(EquityHistory.id == delete_id)
                await session.execute(stmt)
                await session.commit()
                print(f"Deleted record {delete_id}")
                return
            except ValueError:
                print("Invalid ID provided")
                return

        # Otherwise, list recent history
        print("Fetching last 50 records for Account 2...")
        stmt = select(EquityHistory).where(EquityHistory.account_id == 2).order_by(EquityHistory.timestamp.desc()).limit(50)
        result = await session.execute(stmt)
        records = result.scalars().all()

        print(f"{'ID':<10} | {'Account':<8} | {'Timestamp':<30} | {'Equity':<20}")
        print("-" * 75)
        
        for record in records:
            print(f"{record.id:<10} | {record.account_id:<8} | {str(record.timestamp):<30} | {record.equity:<20}")

        print("\nTo delete a record, run this script with the ID as an argument:")
        print("python check_equity_history.py <id_to_delete>")

if __name__ == "__main__":
    asyncio.run(list_and_clean_equity())
