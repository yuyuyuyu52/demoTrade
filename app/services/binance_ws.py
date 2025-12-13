import asyncio
import json
import logging
import websockets
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory price cache: { "BTCUSDT": 50000.0, ... }
price_cache = {}

class BinanceWS:
    def __init__(self, symbols: list[str]):
        self.symbols = [s.lower() for s in symbols]
        self.base_url = settings.BINANCE_WS_URL
        self.running = False

    async def start(self):
        self.running = True
        # Combine streams: btcusdt@aggTrade/ethusdt@aggTrade
        # Using aggTrade is cleaner and avoids zero-price artifacts found in raw trade stream
        streams = "/".join([f"{s}@aggTrade" for s in self.symbols])
        # Correct URL format for Binance Stream
        url = f"{self.base_url}/stream?streams={streams}"
        
        logger.info(f"Connecting to Binance WS: {url}")
        
        while self.running:
            try:
                async with websockets.connect(url) as ws:
                    logger.info("Connected to Binance WS")
                    while self.running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        self._process_message(data)
            except Exception as e:
                logger.error(f"Binance WS connection error: {e}")
                await asyncio.sleep(5) # Retry delay

    def stop(self):
        self.running = False

    def _process_message(self, data):
        # Payload example for trade stream:
        # {
        #   "stream": "btcusdt@trade",
        #   "data": {
        #     "e": "trade",     // Event type
        #     "E": 123456789,   // Event time
        #     "s": "BNBBTC",    // Symbol
        #     "t": 12345,       // Trade ID
        #     "p": "0.001",     // Price
        #     "q": "100",       // Quantity
        #     ...
        #   }
        # }
        if "data" in data and "p" in data["data"]:
            symbol = data["data"]["s"]
            try:
                price = float(data["data"]["p"])
            except (ValueError, TypeError):
                logger.error(f"Invalid price format for {symbol}: {data['data'].get('p')}")
                return

            # Optional: Basic sanity check for positive price
            if price <= 0:
                logger.error(f"CRITICAL: Price is zero or negative: {price}. Symbol: {symbol}. Raw: {data}")
                return

            price_cache[symbol] = price
            # logger.debug(f"Updated price for {symbol}: {price}")

binance_ws_service = BinanceWS(symbols=["btcusdt", "ethusdt", "solusdt"])

def get_current_price(symbol: str) -> float | None:
    return price_cache.get(symbol.upper())

def get_all_prices() -> dict:
    return price_cache
