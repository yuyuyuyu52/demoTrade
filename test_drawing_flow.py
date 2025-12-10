import asyncio
from sqlalchemy import select
from app.database import get_db
from app.models import Drawing
from app.schemas import DrawingResponse

async def test_drawing():
    async for session in get_db():
        try:
            # Create
            d = Drawing(account_id=1, symbol="BTCUSDT", type="line", data={"p1": {}, "p2": {}})
            session.add(d)
            await session.commit()
            await session.refresh(d)
            print(f"Created drawing: {d.id}")
            
            # Read
            result = await session.execute(select(Drawing).filter(Drawing.id == d.id))
            fetched = result.scalar_one()
            print(f"Fetched: {fetched.data}")
            
            # Validate Schema
            schema = DrawingResponse.model_validate(fetched)
            print(f"Schema Validated: {schema}")
            
            # Cleanup
            await session.delete(fetched)
            await session.commit()
            print("Deleted.")
            
        except Exception as e:
            print(f"Error: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_drawing())
