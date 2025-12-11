
import asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Account

from app.schemas import AccountResponse

from app.routers.accounts import calculate_account_metrics

async def main():
    async for session in get_db():
        try:
            stmt = select(Account).options(selectinload(Account.positions)).where(Account.id == 1)
            result = await session.execute(stmt)
            account = result.scalar_one_or_none()
            if account:
                print(f"Account ID: {account.id}")
                
                print("Calculating metrics...")
                account = await calculate_account_metrics(account)
                
                print("Validating with Pydantic...")
                resp = AccountResponse.model_validate(account)
                print("Validation successful!")
                print(resp.chart_settings)
            else:
                print("Account not found")
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()
        break

if __name__ == "__main__":
    asyncio.run(main())
