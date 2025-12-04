import asyncio
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Order, OrderType, OrderSide, OrderStatus, Trade, Account, Position, PositionHistory
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
            if order.symbol == "BTCUSDT" and order.limit_price and order.limit_price < 10000 and order.side == OrderSide.BUY:
                 logger.debug(f"Checking Order {order.id}: {order.symbol} {order.side} {order.limit_price} vs Market {current_price}")

            should_execute = False
            if order.order_type == OrderType.MARKET:
                should_execute = True
            elif order.order_type == OrderType.LIMIT:
                if order.side == OrderSide.BUY and current_price <= order.limit_price:
                    should_execute = True
                elif order.side == OrderSide.SELL and current_price >= order.limit_price:
                    should_execute = True

            if should_execute:
                await self.execute_trade(session, order, current_price)

    async def execute_trade(self, session: AsyncSession, order: Order, price: float):
        # Calculate quantity to fill
        remaining_qty = order.quantity - order.filled_quantity
        fill_qty = remaining_qty # Simple simulation: fill all available
        
        # Calculate Fee
        # Market: 0.045% (0.00045)
        # Limit: 0.018% (0.00018)
        fee_rate = 0.00045 if order.order_type == OrderType.MARKET else 0.00018
        trade_value = price * fill_qty
        fee = trade_value * fee_rate
        
        # Create Trade
        trade = Trade(
            order_id=order.id,
            symbol=order.symbol,
            side=order.side,
            price=price,
            quantity=fill_qty,
            commission=fee
        )
        session.add(trade)

        # Update Order
        # Calculate new average price
        current_total_value = order.price * order.filled_quantity
        new_trade_value = price * fill_qty
        new_total_qty = order.filled_quantity + fill_qty
        
        if new_total_qty > 0:
            order.price = (current_total_value + new_trade_value) / new_total_qty
            
        order.filled_quantity += fill_qty
        order.fee += fee
        if order.filled_quantity >= order.quantity:
            order.status = OrderStatus.FILLED
        else:
            order.status = OrderStatus.PARTIALLY_FILLED
        
        # Update Account & Position
        await self.update_account_and_position(session, order.account_id, order.symbol, order.side, price, fill_qty, order.leverage, fee)
        
        await session.commit()
        logger.info(f"Executed trade for Order {order.id}: {order.side} {fill_qty} {order.symbol} @ {price} Fee: {fee}")

    async def update_account_and_position(self, session: AsyncSession, account_id: int, symbol: str, side: OrderSide, price: float, quantity: float, leverage: int = 1, fee: float = 0.0):
        # Fetch Account
        account = await session.get(Account, account_id)
        if not account:
            logger.error(f"Account {account_id} not found during trade execution")
            return
            
        # Deduct Fee from Balance
        account.balance -= fee

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
                    margin=margin_required,
                    accumulated_fees=fee
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
                    margin=margin_required,
                    accumulated_fees=fee
                )
                session.add(position)
        else:
            # Existing Position
            # Update accumulated fees
            position.accumulated_fees += fee
            
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
                    position.realized_pnl += pnl
                    
                    if abs(position.quantity) < 1e-9:
                        position.quantity = 0
                        # Create History
                        history = PositionHistory(
                            account_id=account_id,
                            symbol=symbol,
                            side="LONG",
                            quantity=close_qty, # This might be misleading if it was a partial close before. 
                            # But we don't track original quantity. Let's just store 0 or the last close qty?
                            # Or maybe we should store the max quantity this position ever had? Too complex for now.
                            # Let's store the quantity that was just closed, or 0.
                            # Actually, PositionHistory usually shows the "Trade" or the "Roundtrip".
                            # If we want "Position History", it implies the whole lifecycle.
                            # Let's just put 0 for quantity as it is closed, or maybe the total volume?
                            # Let's put 0.
                            entry_price=position.entry_price,
                            exit_price=price,
                            leverage=position.leverage,
                            realized_pnl=position.realized_pnl,
                            total_fee=position.accumulated_fees,
                            created_at=position.created_at
                        )
                        session.add(history)
                        await session.delete(position)
                        
                    # If order quantity > current long position, flip to Short?
                    # For simplicity, let's say we just close and don't flip in one order, 
                    # or we handle the flip. Let's handle flip for better UX.
                    if remaining_order_qty > 0:
                        # Open Short with remaining
                        margin_required = (remaining_order_qty * price) / leverage
                        account.balance -= margin_required
                        
                        # Calculate fee for the new position part?
                        # The fee was already deducted for the whole order.
                        # But we need to attribute it to the new position.
                        # This is tricky. The fee passed to this function covers the whole order.
                        # We added it to the old position's accumulated_fees.
                        # If we flip, we should probably split the fee?
                        # Or just leave it on the old position history (as cost of closing/flipping).
                        # And the new position starts with 0 fees?
                        # Or we can say the fee is proportional to quantity.
                        # Let's simplify: All fee goes to the closed position history.
                        # New position starts with 0 accumulated fees (since we already accounted for the trade fee).
                        # Wait, if we open a new position, it should have some cost basis.
                        # But the fee was already paid.
                        # Let's just set accumulated_fees=0 for the new flipped position for now.
                        
                        new_pos = Position(
                            account_id=account_id,
                            symbol=symbol,
                            quantity=-remaining_order_qty,
                            entry_price=price,
                            leverage=leverage,
                            margin=margin_required,
                            accumulated_fees=0.0
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
                    position.realized_pnl += pnl
                    
                    if abs(position.quantity) < 1e-9:
                        position.quantity = 0
                        # Create History == 0:
                        # Create History
                        history = PositionHistory(
                            account_id=account_id,
                            symbol=symbol,
                            side="SHORT",
                            quantity=0,
                            entry_price=position.entry_price,
                            exit_price=price,
                            leverage=position.leverage,
                            realized_pnl=position.realized_pnl,
                            total_fee=position.accumulated_fees,
                            created_at=position.created_at
                        )
                        session.add(history)
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
                            margin=margin_required,
                            accumulated_fees=0.0
                        )
                        session.add(new_pos)

matching_engine = MatchingEngine()
