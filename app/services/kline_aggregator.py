"""
K线聚合器 - 从aggTrade流聚合1秒K线
"""
import asyncio
import time
from datetime import datetime
from collections import defaultdict
from typing import Dict, List, Optional
import websockets
import json

import aiohttp
from questdb.ingress import Sender, TimestampNanos
import sys

QUESTDB_HOST = 'localhost'
QUESTDB_ILP_PORT = 9009
QUESTDB_REST_PORT = 9000

async def ensure_questdb_table():
    """Ensure the trades table exists with correct schema"""
    create_sql = """
    CREATE TABLE IF NOT EXISTS trades (
        symbol SYMBOL,
        price DOUBLE,
        quantity DOUBLE,
        time TIMESTAMP,
        is_buyer_maker BOOLEAN,
        trade_id LONG
    ) TIMESTAMP(time) PARTITION BY DAY WAL DEDUP UPSERT KEYS(time, symbol, trade_id);
    """
    url = f"http://{QUESTDB_HOST}:{QUESTDB_REST_PORT}/exec"
    try:
        async with aiohttp.ClientSession() as session:
             async with session.get(url, params={'query': create_sql}) as resp:
                 if resp.status == 200:
                     print("QuestDB table trades ensured.")
                 else:
                     text = await resp.text()
                     print(f"Failed to create QuestDB table: {text}")
    except Exception as e:
        print(f"Error connecting to QuestDB: {e}")


class KlineAggregator:
    """从aggTrade聚合K线的服务"""
    
    def __init__(self, symbol: str, interval_seconds: int = 1):
        self.symbol = symbol.upper()
        self.interval_seconds = interval_seconds
        self.current_kline: Optional[Dict] = None
        self.completed_klines: List[Dict] = []
        self.max_history = 1000  # 保留最近1000根K线
        self.subscribers = set()  # WebSocket订阅者
        self.ws_task = None
        self.is_running = False
        
    def _get_kline_start_time(self, timestamp_ms: int) -> int:
        """获取K线开始时间（毫秒）"""
        return (timestamp_ms // (self.interval_seconds * 1000)) * (self.interval_seconds * 1000)
    
    def _create_new_kline(self, trade_time: int, price: float, qty: float) -> Dict:
        """创建新的K线"""
        kline_start = self._get_kline_start_time(trade_time)
        return {
            'time': kline_start,
            'open': price,
            'high': price,
            'low': price,
            'close': price,
            'volume': qty,
            'trades': 1,
            'closeTime': kline_start + (self.interval_seconds * 1000) - 1
        }
    
    def _update_kline(self, kline: Dict, price: float, qty: float):
        """更新现有K线"""
        kline['high'] = max(kline['high'], price)
        kline['low'] = min(kline['low'], price)
        kline['close'] = price
        kline['volume'] += qty
        kline['trades'] += 1
    
    def process_trade(self, trade_data: Dict) -> Optional[Dict]:
        """
        处理单笔交易，返回完成的K线（如果有）
        
        trade_data格式:
        {
            "e": "aggTrade",
            "E": event_time,
            "s": "BTCUSDT",
            "a": agg_trade_id,
            "p": "price",
            "q": "quantity",
            "T": trade_time,
            ...
        }
        """
        try:
            trade_time = trade_data['T']  # 毫秒时间戳
            price = float(trade_data['p'])
            qty = float(trade_data['q'])
            
            kline_start = self._get_kline_start_time(trade_time)
            
            # 如果没有当前K线，或者交易时间进入了新的周期
            if self.current_kline is None:
                self.current_kline = self._create_new_kline(trade_time, price, qty)
                return None
            
            current_kline_start = self.current_kline['time']
            
            if kline_start > current_kline_start:
                # 当前K线完成，保存并创建新K线
                completed = self.current_kline.copy()
                self.completed_klines.append(completed)
                
                # 只保留最近的历史
                if len(self.completed_klines) > self.max_history:
                    self.completed_klines.pop(0)
                
                # 创建新K线
                self.current_kline = self._create_new_kline(trade_time, price, qty)
                return completed
            
            elif kline_start == current_kline_start:
                # 更新当前K线
                self._update_kline(self.current_kline, price, qty)
                return None
            
            else:
                # 理论上不应该出现（交易时间早于当前K线），但为了健壮性处理
                return None
                
        except (KeyError, ValueError) as e:
            print(f"Error processing trade: {e}")
            return None
    
    def _save_trade_to_questdb(self, trade: Dict):
        """Save raw trade to QuestDB (Synchronous)"""
        try:
            with Sender('tcp', QUESTDB_HOST, QUESTDB_ILP_PORT) as sender:
                sender.row(
                    'trades',
                    symbols={'symbol': self.symbol},
                    columns={
                        'price': float(trade['p']),
                        'quantity': float(trade['q']),
                        'is_buyer_maker': trade['m'],
                        'trade_id': int(trade['a'])
                    },
                    at=TimestampNanos(trade['T'] * 1_000_000)
                )
                sender.flush()
        except Exception as e:
            print(f"QuestDB Trade Write Error: {e}")

    async def save_trade_async(self, trade: Dict):
        """Save raw trade to QuestDB (Async wrapper)"""
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._save_trade_to_questdb, trade)
    
    def get_current_kline(self) -> Optional[Dict]:
        """获取当前未完成的K线"""
        return self.current_kline.copy() if self.current_kline else None
    
    async def get_history(self, limit: int = 1000, end_time: Optional[int] = None) -> List[Dict]:
        """获取历史K线，优先从QuestDB的Trades表实时聚合"""
        
        # Try fetching from QuestDB
        try:
            # QuestDB SAMPLE BY SQL for aggregating trades into klines
            # Must use subquery to ORDER BY DESC after SAMPLE BY
            inner_query = f"""
            SELECT
                timestamp_floor('{self.interval_seconds}s', time) as kline_time,
                first(price) as open,
                max(price) as high,
                min(price) as low,
                last(price) as close,
                sum(quantity) as volume
            FROM trades
            WHERE symbol = '{self.symbol}'
            """
            
            if end_time:
                end_iso = datetime.utcfromtimestamp(end_time / 1000.0).isoformat() + 'Z'
                inner_query += f" AND time <= '{end_iso}'"
                
            inner_query += f" SAMPLE BY {self.interval_seconds}s ALIGN TO CALENDAR"
            
            query = f"SELECT * FROM ({inner_query}) ORDER BY kline_time DESC LIMIT {limit}"
            
            url = f"http://{QUESTDB_HOST}:{QUESTDB_REST_PORT}/exec"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params={'query': query}) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        if 'dataset' in data and len(data['dataset']) > 0:
                            rows = data['dataset']
                            cols = [c['name'] for c in data['columns']]
                            
                            result = []
                            for row in rows:
                                r = dict(zip(cols, row))
                                t_str = r['kline_time'] # Name from AS alias
                                dt = datetime.fromisoformat(t_str.replace('Z', '+00:00'))
                                t_ms = int(dt.timestamp() * 1000)
                                
                                result.append({
                                    'time': t_ms,
                                    'open': r['open'],
                                    'high': r['high'],
                                    'low': r['low'],
                                    'close': r['close'],
                                    'volume': r['volume'],
                                    'trades': 0,
                                    'closeTime': t_ms + (self.interval_seconds * 1000) - 1
                                })
                            
                            result.reverse()
                            return result
        except Exception as e:
            print(f"QuestDB Read Error: {e}")

        # Fallback to Memory (Only recent 1000)
        if not self.completed_klines:
            return []
            
        if end_time is not None:
            filtered = [k for k in self.completed_klines if k['time'] <= end_time]
            return filtered[-limit:]
            
        return self.completed_klines[-limit:]
    
    def format_kline_for_client(self, kline: Dict) -> List:
        """格式化K线为客户端格式 [time, o, h, l, c, v]"""
        return [
            kline['time'],
            str(kline['open']),
            str(kline['high']),
            str(kline['low']),
            str(kline['close']),
            str(kline['volume'])
        ]
    
    async def start_aggregation(self):
        """启动aggTrade WebSocket并开始聚合"""
        self.is_running = True
        ws_symbol = self.symbol.lower()
        url = f"wss://fstream.binance.com/ws/{ws_symbol}@aggTrade"
        
        print(f"Starting KlineAggregator for {self.symbol} @ {self.interval_seconds}s")
        
        while self.is_running:
            try:
                async with websockets.connect(url) as websocket:
                    print(f"Connected to aggTrade stream: {self.symbol}")
                    
                    async for message in websocket:
                        if not self.is_running:
                            break
                        
                        try:
                            data = json.loads(message)
                            
                            # 保存原始交易数据
                            await self.save_trade_async(data)

                            # 处理交易并检查是否有完成的K线
                            completed_kline = self.process_trade(data)
                            
                            if completed_kline:
                                # 通知所有订阅者
                                await self._notify_subscribers(completed_kline, is_final=True)
                                # 注意：不再保存 K 线，因为我们保存了原始 Trades
                            
                            # 定期发送当前K线更新（每100笔交易或每秒）
                            current = self.get_current_kline()
                            if current and current.get('trades', 0) % 100 == 0:
                                await self._notify_subscribers(current, is_final=False)
                                
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            print(f"Error processing message: {e}")
                            
            except websockets.exceptions.WebSocketException as e:
                print(f"WebSocket error for {self.symbol}: {e}")
                if self.is_running:
                    await asyncio.sleep(5)  # 重连延迟
            except Exception as e:
                print(f"Unexpected error in aggregator: {e}")
                if self.is_running:
                    await asyncio.sleep(5)
    
    async def _notify_subscribers(self, kline: Dict, is_final: bool):
        """通知所有订阅者"""
        if not self.subscribers:
            return
        
        # 格式化为lightweight-charts兼容的kline消息
        message = {
            'k': {
                't': kline['time'],
                'o': str(kline['open']),
                'h': str(kline['high']),
                'l': str(kline['low']),
                'c': str(kline['close']),
                'v': str(kline['volume']),
                'x': is_final  # K线是否完成
            }
        }
        
        # 发送给所有订阅者
        dead_subscribers = set()
        for subscriber in self.subscribers:
            try:
                await subscriber.send_json(message)
            except Exception:
                dead_subscribers.add(subscriber)
        
        # 清理断开的订阅者
        self.subscribers -= dead_subscribers
    
    def subscribe(self, websocket):
        """添加订阅者"""
        self.subscribers.add(websocket)
    
    def unsubscribe(self, websocket):
        """移除订阅者"""
        self.subscribers.discard(websocket)
    
    async def stop(self):
        """停止聚合"""
        self.is_running = False
        if self.ws_task:
            self.ws_task.cancel()
            try:
                await self.ws_task
            except asyncio.CancelledError:
                pass


# 全局聚合器管理器
class AggregatorManager:
    """管理多个symbol的聚合器"""
    
    def __init__(self):
        self.aggregators: Dict[str, KlineAggregator] = {}
        self._db_checked = False
        
    def get_or_create(self, symbol: str, interval_seconds: int = 1) -> KlineAggregator:
        """获取或创建聚合器"""
        if not self._db_checked:
            try:
                asyncio.create_task(ensure_questdb_table())
                self._db_checked = True
            except RuntimeError:
                pass # Can't schedule task if no loop 

        key = f"{symbol}_{interval_seconds}s"
        
        if key not in self.aggregators:
            aggregator = KlineAggregator(symbol, interval_seconds)
            self.aggregators[key] = aggregator
            # 启动聚合任务
            asyncio.create_task(aggregator.start_aggregation())
        
        return self.aggregators[key]
    
    async def stop_all(self):
        """停止所有聚合器"""
        tasks = [agg.stop() for agg in self.aggregators.values()]
        await asyncio.gather(*tasks, return_exceptions=True)
        self.aggregators.clear()


# 全局实例
aggregator_manager = AggregatorManager()
