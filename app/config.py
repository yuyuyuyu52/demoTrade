from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    BINANCE_WS_URL: str = "wss://fstream.binance.com"
    
    # Coinbase
    COINBASE_API_URL: str = "https://api.exchange.coinbase.com"
    COINBASE_WS_URL: str = "wss://advanced-trade-ws.coinbase.com"

    # Trading Fees
    MARKET_FEE_RATE: float = 0.00045 # 0.045%
    LIMIT_FEE_RATE: float = 0.00018  # 0.018%

    class Config:
        env_file = ".env"

settings = Settings()
