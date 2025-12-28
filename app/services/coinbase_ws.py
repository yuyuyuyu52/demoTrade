import asyncio
import json
import logging
import websockets
from app.config import settings

logger = logging.getLogger(__name__)

# In-memory price cache: { "BTC-PERP": 50000.0, ... }
price_cache = {}

class CoinbaseWS:
    def __init__(self, product_ids: list[str]):
        self.product_ids = product_ids
        self.url = settings.COINBASE_WS_URL
        self.running = False

    async def start(self):
        self.running = True
        logger.info(f"Connecting to Coinbase WS: {self.url}")
        
        while self.running:
            try:
                async with websockets.connect(self.url) as ws:
                    logger.info("Connected to Coinbase WS")
                    
                    # Subscribe
                    subscribe_msg = {
                        "type": "subscribe",
                        "product_ids": self.product_ids,
                        "channel": "ticker"
                    }
                    await ws.send(json.dumps(subscribe_msg))
                    
                    while self.running:
                        msg = await ws.recv()
                        data = json.loads(msg)
                        self._process_message(data)
            except Exception as e:
                logger.error(f"Coinbase WS connection error: {e}")
                await asyncio.sleep(5) # Retry delay

    def stop(self):
        self.running = False

    def _process_message(self, data):
        # Data format: { "channel": "ticker", "events": [ { "tickers": [ { "product_id": "BTC-USD", "price": "..." } ] } ] }
        if "events" in data:
            for event in data["events"]:
                if "tickers" in event:
                    for ticker in event["tickers"]:
                        product_id = ticker.get("product_id")
                        price_str = ticker.get("price")
                        
                        if product_id and price_str:
                            try:
                                price = float(price_str)
                                price_cache[product_id] = price
                            except ValueError:
                                pass

coinbase_ws_service = CoinbaseWS(product_ids=["BTC-USD", "ETH-USD", "SOL-USD"])

def get_current_price(product_id: str) -> float | None:
    return price_cache.get(product_id)

def get_all_coinbase_prices() -> dict:
    return price_cache
