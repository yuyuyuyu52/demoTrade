
import { LineStyle } from 'lightweight-charts';

class DrawingsPaneRenderer {
    constructor(drawings, series, chart) {
        this._drawings = drawings;
        this._series = series;
        this._chart = chart;
    }

    _getClosestTimeCoordinate(timeScale, targetTime) {
        if (targetTime === undefined || targetTime === null) return null;

        // 1. Try direct conversion
        try {
            const coord = timeScale.timeToCoordinate(targetTime);
            if (coord !== null) return coord;
        } catch (e) {
            // Continue to fallback
        }

        // 2. Extrapolate for future time
        try {
            const data = this._series.data();
            if (data && data.length >= 2) {
                const lastBar = data[data.length - 1];
                const lastTime = Number(lastBar.time);
                const tTime = Number(targetTime);

                if (tTime > lastTime) {
                    const prevBar = data[data.length - 2];
                    const prevTime = Number(prevBar.time);
                    const interval = lastTime - prevTime;

                    if (interval > 0) {
                        const diffBars = (tTime - lastTime) / interval;
                        
                        // Get last bar's logical index
                        const lastBarCoord = timeScale.timeToCoordinate(lastBar.time);
                        if (lastBarCoord !== null) {
                            const lastBarLogical = timeScale.coordinateToLogical(lastBarCoord);
                            if (lastBarLogical !== null) {
                                const targetLogical = lastBarLogical + diffBars;
                                const targetCoord = timeScale.logicalToCoordinate(targetLogical);
                                if (targetCoord !== null) return targetCoord;
                            }
                        }
                    }
                }
            }
        } catch (e) {
            // Ignore errors and fall through
        }

        // 3. Fallback: Find closest bar (for past times or if extrapolation fails)
        // Note: accessing data() might be expensive if called frequently. 
        // Ideally we should cache this or optimize.
        try {
            const data = this._series.data();
            if (!data || data.length === 0) return null;

            // Binary search for closest time
            let left = 0;
            let right = data.length - 1;
            let closest = data[0];
            
            // Handle potential object time (BusinessDay) vs Number (Timestamp) mismatch
            // Assuming we use timestamps (numbers)
            const tTime = Number(targetTime);
            if (isNaN(tTime)) return null;

            let minDiff = Math.abs((data[0].time) - tTime);

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const item = data[mid];
                const itemTime = Number(item.time);
                const diff = Math.abs(itemTime - tTime);

                if (diff < minDiff) {
                    minDiff = diff;
                    closest = item;
                }

                if (itemTime < tTime) {
                    left = mid + 1;
                } else if (itemTime > tTime) {
                    right = mid - 1;
                } else {
                    return timeScale.timeToCoordinate(item.time);
                }
            }
            
            return timeScale.timeToCoordinate(closest.time);
        } catch (e) {
            return null;
        }
    }

    draw(target) {
        target.useBitmapCoordinateSpace(scope => {
            const ctx = scope.context;
            const timeScale = this._chart.timeScale();
            
            // Apply scaling for Retina/High-DPI displays
            const horizontalPixelRatio = scope.horizontalPixelRatio || 1;
            const verticalPixelRatio = scope.verticalPixelRatio || 1;
            
            ctx.save();
            ctx.scale(horizontalPixelRatio, verticalPixelRatio);
            
            this._drawings.forEach(d => {
                if (!d.p1 || !d.p2) return;

                const x1 = this._getClosestTimeCoordinate(timeScale, d.p1.time);
                const y1 = this._series.priceToCoordinate(d.p1.price);
                const x2 = this._getClosestTimeCoordinate(timeScale, d.p2.time);
                const y2 = this._series.priceToCoordinate(d.p2.price);

                if (x1 === null || y1 === null || x2 === null || y2 === null) return;

                ctx.save();
                
                if (d.type === 'line') {
                    this._drawLine(ctx, x1, y1, x2, y2);
                } else if (d.type === 'rect') {
                    this._drawRect(ctx, x1, y1, x2, y2);
                } else if (d.type === 'fib') {
                    this._drawFib(ctx, x1, y1, x2, y2);
                } else if (d.type === 'long') {
                    this._drawPosition(ctx, x1, y1, x2, y2, 'long');
                } else if (d.type === 'short') {
                    this._drawPosition(ctx, x1, y1, x2, y2, 'short');
                }

                ctx.restore();
            });
            
            ctx.restore(); // Restore the scaling
        });
    }

    _drawLine(ctx, x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _drawRect(ctx, x1, y1, x2, y2) {
        const w = x2 - x1;
        const h = y2 - y1;
        ctx.fillStyle = 'rgba(41, 98, 255, 0.2)';
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.rect(x1, y1, w, h);
        ctx.fill();
        ctx.stroke();
    }

    _drawFib(ctx, x1, y1, x2, y2) {
        // Draw trend line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = '#787B86';
        ctx.stroke();
        ctx.setLineDash([]);

        const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const colors = {
            0: '#787B86',
            1: '#787B86',
            0.5: '#4CAF50',
            0.618: '#2962FF'
        };

        const yDiff = y2 - y1;

        levels.forEach(level => {
            const y = y1 + yDiff * level;
            
            ctx.beginPath();
            ctx.moveTo(x1, y);
            ctx.lineTo(x2, y);
            
            ctx.strokeStyle = colors[level] || '#2962FF';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Text
            ctx.font = '10px sans-serif';
            ctx.fillStyle = colors[level] || '#2962FF';
            ctx.fillText(level.toFixed(3), x1, y - 2);
        });
    }

    _drawPosition(ctx, x1, y1, x2, y2, type) {
        // x1, y1 is Entry
        // x2, y2 is Stop Loss (visually)
        
        // We need to calculate Target based on Risk.
        // Risk = |y2 - y1|
        // Let's assume Reward = 2 * Risk
        
        const riskY = Math.abs(y2 - y1);
        const rewardY = riskY * 2;
        
        // Determine direction based on type
        // Long: SL should be below Entry (y2 > y1). Target above (y < y1).
        // Short: SL should be above Entry (y2 < y1). Target below (y > y1).
        
        // However, we respect user's drag.
        // If user drags SL, we calculate Target in opposite direction.
        
        const yDiff = y2 - y1;
        const targetY = y1 - yDiff * 2;
        
        // Draw Stop Loss Box (Red)
        ctx.fillStyle = 'rgba(255, 82, 82, 0.2)';
        ctx.strokeStyle = '#FF5252';
        ctx.beginPath();
        ctx.rect(x1, y1, x2 - x1, y2 - y1);
        ctx.fill();
        ctx.stroke();
        
        // Draw Take Profit Box (Green)
        ctx.fillStyle = 'rgba(0, 230, 118, 0.2)';
        ctx.strokeStyle = '#00E676';
        ctx.beginPath();
        ctx.rect(x1, y1, x2 - x1, targetY - y1);
        ctx.fill();
        ctx.stroke();
        
        // Draw Entry Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.strokeStyle = '#787B86';
        ctx.stroke();
        
        // Draw Labels
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#FF5252';
        ctx.fillText('Stop', x2 + 5, y2);
        
        ctx.fillStyle = '#00E676';
        ctx.fillText('Target', x2 + 5, targetY);
    }
}

export class DrawingsPrimitive {
    constructor() {
        this._drawings = [];
        this._series = null;
        this._chart = null;
        this._requestUpdate = () => {};
    }

    attached({ chart, series, requestUpdate }) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
    }

    detached() {
        this._chart = null;
        this._series = null;
        this._requestUpdate = () => {};
    }

    setDrawings(drawings) {
        this._drawings = drawings;
        this._requestUpdate();
    }

    paneViews() {
        if (!this._series || !this._chart) return [];
        return [{
            renderer: () => new DrawingsPaneRenderer(this._drawings, this._series, this._chart),
        }];
    }
}
