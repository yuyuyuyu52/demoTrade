from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    BINANCE_WS_URL: str = "wss://fstream.binance.com"

    class Config:
        env_file = ".env"

settings = Settings()
