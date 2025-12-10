from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/drawings",
    tags=["drawings"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.DrawingResponse)
async def create_drawing(drawing: schemas.DrawingCreate, db: AsyncSession = Depends(get_db)):
    db_drawing = models.Drawing(**drawing.dict())
    db.add(db_drawing)
    await db.commit()
    await db.refresh(db_drawing)
    return db_drawing

@router.get("/", response_model=List[schemas.DrawingResponse])
async def read_drawings(account_id: int, symbol: str, db: AsyncSession = Depends(get_db)):
    try:
        result = await db.execute(
            select(models.Drawing).filter(
                models.Drawing.account_id == account_id,
                models.Drawing.symbol == symbol
            )
        )
        drawings = result.scalars().all()
        return drawings
    except Exception as e:
        print(f"Error reading drawings: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{drawing_id}")
async def delete_drawing(drawing_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(models.Drawing).filter(models.Drawing.id == drawing_id))
    db_drawing = result.scalar_one_or_none()
    
    if not db_drawing:
        raise HTTPException(status_code=404, description="Drawing not found")
    
    await db.delete(db_drawing)
    await db.commit()
    return {"ok": True}
