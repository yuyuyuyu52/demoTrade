import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.database import init_db
from app.routers import orders, accounts, market, positions, drawings
from app.services.binance_ws import binance_ws_service
from app.services.coinbase_ws import coinbase_ws_service
from app.services.matching_engine import matching_engine
from app.services.equity_recorder import equity_recorder

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    
    # Start background tasks
    ws_task = asyncio.create_task(binance_ws_service.start())
    coinbase_ws_task = asyncio.create_task(coinbase_ws_service.start())
    match_task = asyncio.create_task(matching_engine.start())
    equity_task = asyncio.create_task(equity_recorder.start())
    
    yield
    
    # Shutdown
    binance_ws_service.stop()
    coinbase_ws_service.stop()
    matching_engine.stop()
    equity_recorder.stop()
    # Wait for tasks to finish if needed, or let them be cancelled
    # ws_task.cancel()
    # match_task.cancel()

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Demo Trading System", lifespan=lifespan)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router)
app.include_router(accounts.router)
app.include_router(market.router)
app.include_router(positions.router)
app.include_router(drawings.router)

@app.get("/")
async def root():
    return {"message": "Trading System is running"}
