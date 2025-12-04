import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Order, OrderType, OrderSide, OrderStatus, Trade, Account, Position
from app.services.binance_ws import get_current_price
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

class MatchingEngine:
    def __init__(self):
        self.running = False

    async def start(self):
        self.running = True
        logger.info("Matching Engine started")
        while self.running:
            try:
                async with AsyncSessionLocal() as session:
                    await self.process_open_orders(session)
            except Exception as e:
                logger.error(f"Error in matching engine loop: {e}")
            
            await asyncio.sleep(1) # Check every second

    def stop(self):
        self.running = False

    async def process_open_orders(self, session: AsyncSession):
        # Fetch all NEW or PARTIALLY_FILLED orders (LIMIT and MARKET)
        stmt = select(Order).where(
            Order.status.in_([OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED])
        )
        result = await session.execute(stmt)
        orders = result.scalars().all()

        for order in orders:
            current_price = get_current_price(order.symbol)
            if current_price is None or current_price <= 0:
                continue

            # Debug logging
            if order.symbol == "BTCUSDT" and order.price < 10000 and order.side == OrderSide.BUY:
                 logger.debug(f"Checking Order {order.id}: {order.symbol} {order.side} {order.price} vs Market {current_price}")

            should_execute = False
            if order.order_type == OrderType.MARKET:
                should_execute = True
            elif order.order_type == OrderType.LIMIT:
                if order.side == OrderSide.BUY and current_price <= order.price:
                    should_execute = True
                elif order.side == OrderSide.SELL and current_price >= order.price:
                    should_execute = True

            if should_execute:
                await self.execute_trade(session, order, current_price)

    async def execute_trade(self, session: AsyncSession, order: Order, price: float):
        # Calculate quantity to fill
        remaining_qty = order.quantity - order.filled_quantity
        fill_qty = remaining_qty # Simple simulation: fill all available
        
        # Create Trade
        trade = Trade(
            order_id=order.id,
            symbol=order.symbol,
            side=order.side,
            price=price,
            quantity=fill_qty,
            commission=0.0 # Simplified
        )
        session.add(trade)

        # Update Order
        order.filled_quantity += fill_qty
        if order.filled_quantity >= order.quantity:
            order.status = OrderStatus.FILLED
        else:
            order.status = OrderStatus.PARTIALLY_FILLED
        
        # Update Account & Position
        await self.update_account_and_position(session, order.account_id, order.symbol, order.side, price, fill_qty, order.leverage)
        
        await session.commit()
        logger.info(f"Executed trade for Order {order.id}: {order.side} {fill_qty} {order.symbol} @ {price}")

    async def update_account_and_position(self, session: AsyncSession, account_id: int, symbol: str, side: OrderSide, price: float, quantity: float, leverage: int = 1):
        # Fetch Account
        account = await session.get(Account, account_id)
        if not account:
            logger.error(f"Account {account_id} not found during trade execution")
            return

        # Fetch Position
        stmt = select(Position).where(Position.account_id == account_id, Position.symbol == symbol)
        result = await session.execute(stmt)
        position = result.scalar_one_or_none()

        # Calculate trade value and margin impact
        trade_value = price * quantity
        
        # Futures Logic (One-way Mode)
        # Position.quantity > 0: LONG
        # Position.quantity < 0: SHORT
        
        if not position:
            # New Position
            if side == OrderSide.BUY:
                # Open Long
                margin_required = trade_value / leverage
                account.balance -= margin_required # Deduct margin from balance (simplified)
                
                position = Position(
                    account_id=account_id, 
                    symbol=symbol, 
                    quantity=quantity, 
                    entry_price=price,
                    leverage=leverage,
                    margin=margin_required
                )
                session.add(position)
            else: # SELL
                # Open Short
                margin_required = trade_value / leverage
                account.balance -= margin_required
                
                position = Position(
                    account_id=account_id, 
                    symbol=symbol, 
                    quantity=-quantity, # Negative for Short
                    entry_price=price,
                    leverage=leverage,
                    margin=margin_required
                )
                session.add(position)
        else:
            # Existing Position
            current_qty = position.quantity
            
            if current_qty > 0: # Currently LONG
                if side == OrderSide.BUY:
                    # Add to Long
                    margin_required = trade_value / leverage
                    account.balance -= margin_required
                    
                    total_cost = (current_qty * position.entry_price) + trade_value
                    total_qty = current_qty + quantity
                    
                    position.entry_price = total_cost / total_qty
                    position.quantity = total_qty
                    position.margin += margin_required
                    position.leverage = leverage # Update leverage to new order's leverage? Or keep old? Let's update.
                else: # SELL
                    # Close Long (Partial or Full)
                    close_qty = min(quantity, current_qty)
                    remaining_order_qty = quantity - close_qty
                    
                    # PNL Calculation
                    # PNL = (Exit Price - Entry Price) * Close Qty
                    pnl = (price - position.entry_price) * close_qty
                    
                    # Release Margin
                    # Proportional release
                    margin_released = (close_qty / current_qty) * position.margin
                    
                    account.balance += margin_released + pnl
                    position.margin -= margin_released
                    position.quantity -= close_qty
                    
                    if position.quantity == 0:
                        await session.delete(position)
                        
                    # If order quantity > current long position, flip to Short?
                    # For simplicity, let's say we just close and don't flip in one order, 
                    # or we handle the flip. Let's handle flip for better UX.
                    if remaining_order_qty > 0:
                        # Open Short with remaining
                        margin_required = (remaining_order_qty * price) / leverage
                        account.balance -= margin_required
                        
                        new_pos = Position(
                            account_id=account_id,
                            symbol=symbol,
                            quantity=-remaining_order_qty,
                            entry_price=price,
                            leverage=leverage,
                            margin=margin_required
                        )
                        session.add(new_pos)

            elif current_qty < 0: # Currently SHORT
                abs_qty = abs(current_qty)
                if side == OrderSide.SELL:
                    # Add to Short
                    margin_required = trade_value / leverage
                    account.balance -= margin_required
                    
                    total_cost = (abs_qty * position.entry_price) + trade_value
                    total_qty = abs_qty + quantity
                    
                    position.entry_price = total_cost / total_qty
                    position.quantity = -total_qty
                    position.margin += margin_required
                    position.leverage = leverage
                else: # BUY
                    # Close Short
                    close_qty = min(quantity, abs_qty)
                    remaining_order_qty = quantity - close_qty
                    
                    # PNL Calculation for Short
                    # PNL = (Entry Price - Exit Price) * Close Qty
                    pnl = (position.entry_price - price) * close_qty
                    
                    # Release Margin
                    margin_released = (close_qty / abs_qty) * position.margin
                    
                    account.balance += margin_released + pnl
                    position.margin -= margin_released
                    position.quantity += close_qty # -10 + 5 = -5
                    
                    if position.quantity == 0:
                        await session.delete(position)
                        
                    if remaining_order_qty > 0:
                        # Open Long with remaining
                        margin_required = (remaining_order_qty * price) / leverage
                        account.balance -= margin_required
                        
                        new_pos = Position(
                            account_id=account_id,
                            symbol=symbol,
                            quantity=remaining_order_qty,
                            entry_price=price,
                            leverage=leverage,
                            margin=margin_required
                        )
                        session.add(new_pos)

matching_engine = MatchingEngine()
