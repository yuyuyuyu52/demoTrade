import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import AsyncSessionLocal
from app.models import Account, EquityHistory
from app.routers.accounts import calculate_account_metrics

logger = logging.getLogger(__name__)

class EquityRecorder:
    def __init__(self):
        self.running = False

    async def start(self):
        self.running = True
        logger.info("Equity Recorder started")
        while self.running:
            try:
                async with AsyncSessionLocal() as session:
                    await self.record_equity(session)
            except Exception as e:
                logger.error(f"Error in equity recorder: {e}")
            
            await asyncio.sleep(60) # Record every 60 seconds

    def stop(self):
        self.running = False

    async def record_equity(self, session):
        # Fetch all accounts with positions
        stmt = select(Account).options(selectinload(Account.positions))
        result = await session.execute(stmt)
        accounts = result.scalars().all()

        for account in accounts:
            # Calculate current equity
            # Note: calculate_account_metrics modifies the account object in place with .equity
            await calculate_account_metrics(account)
            
            # Create history record
            history = EquityHistory(
                account_id=account.id,
                equity=account.equity
            )
            session.add(history)
        
        await session.commit()

equity_recorder = EquityRecorder()
