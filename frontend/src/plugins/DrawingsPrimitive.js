
import { LineStyle } from 'lightweight-charts';

class DrawingsPaneRenderer {
    constructor(drawings, series, chart, selectedId) {
        this._drawings = drawings;
        this._series = series;
        this._chart = chart;
        this._selectedId = selectedId;
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
                    this._drawPosition(ctx, x1, y1, x2, y2, 'long', d);
                } else if (d.type === 'short') {
                    this._drawPosition(ctx, x1, y1, x2, y2, 'short', d);
                }

                if (d.id === this._selectedId) {
                    this._drawAnchors(ctx, x1, y1, x2, y2, d);
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

    _drawPosition(ctx, x1, y1, x2, y2, type, d) {
        // x1, y1 is Entry
        // Standard logic: x2 determines width (Time).
        // If p3 and p4 exist, they determine Top/Bottom prices.

        let topY, bottomY;

        if (d.p3 && d.p4) {
            const y3 = this._series.priceToCoordinate(d.p3.price);
            const y4 = this._series.priceToCoordinate(d.p4.price);
            // We need to determine which is top/bottom visually (screen coordinates)
            // Y grows downwards. So lower Y value is higher on screen.
            // p3 is "Top Height" (visually higher, lower Y value)
            // p4 is "Bottom Height" (visually lower, higher Y value)

            // However, let's just use the prices from p3/p4 directly
            topY = Math.min(y3, y4); // Higher on screen
            bottomY = Math.max(y3, y4); // Lower on screen

            // Check if we need to swap based on type? 
            // Actually, usually user drags them freely.
            // But for coloring, we need to know which box is Profit/Loss.

            // Re-evaluate from prices strictly:
            // LONG: Profit is ABOVE entry (Price > EntryPrice). Loss is BELOW.
            // On screen (Y): Profit Y < Entry Y. Loss Y > Entry Y.

            // We just draw two boxes from y1 to Top and y1 to Bottom.
            // We need to decide which is Green/Red.

            const y3_price = d.p3.price;
            const y4_price = d.p4.price;
            const entryPrice = d.p1.price;

            // We assume p3 handles the "Above" point and p4 handles "Below" point as per user description?
            // Or we just calculate PnL zones based on where p3/p4 are relative to p1.

            // Let's use flexible logic:
            // Box 1: y1 to y3.
            // Box 2: y1 to y4.
            // If type == 'long':
            //    Zone > entry is Green. Zone < entry is Red.
            // If type == 'short':
            //    Zone < entry is Green. Zone > entry is Red.

            // Helper to draw box
            const drawBox = (yStart, yEnd, isProfit) => {
                if (Math.abs(yStart - yEnd) < 1) return;
                ctx.beginPath();
                ctx.rect(x1, Math.min(yStart, yEnd), x2 - x1, Math.abs(yStart - yEnd));
                ctx.fillStyle = isProfit ? 'rgba(0, 230, 118, 0.2)' : 'rgba(255, 82, 82, 0.2)';
                ctx.strokeStyle = isProfit ? '#00E676' : '#FF5252';
                ctx.fill();
                ctx.stroke();
            };

            // Draw p3 box
            const isP3Profit = type === 'long' ? (y3_price > entryPrice) : (y3_price < entryPrice);
            drawBox(y1, this._series.priceToCoordinate(y3_price), isP3Profit);

            // Draw p4 box
            const isP4Profit = type === 'long' ? (y4_price > entryPrice) : (y4_price < entryPrice);
            drawBox(y1, this._series.priceToCoordinate(y4_price), isP4Profit);

        } else {
            // FALLBACK LEGACY LOGIC
            // x1, y1 is Entry
            // x2, y2 is Stop Loss (visually)

            // Risk = |y2 - y1|
            // Reward = 2 * Risk

            const riskY = Math.abs(y2 - y1);
            // const rewardY = riskY * 2;

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

            // Draw Labels
            ctx.fillStyle = '#00E676';
            ctx.fillText('Target', x2 + 5, targetY);
        }

        // Draw Entry Line
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y1);
        ctx.strokeStyle = '#787B86';
        ctx.stroke();
    }

    _drawAnchors(ctx, x1, y1, x2, y2, d) {
        const type = d.type;
        const radius = 6;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = 2;

        const drawPoint = (x, y) => {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI);
            ctx.fill();
            ctx.stroke();
        };

        if (type === 'long' || type === 'short') {
            // Anchor 1: Origin (Entry)
            drawPoint(x1, y1);

            // Anchor 2: Width (Right, vertically centered on Entry)
            drawPoint(x2, y1);

            // Anchor 3 & 4: Top/Bottom
            if (d.p3 && d.p4) {
                const y3 = this._series.priceToCoordinate(d.p3.price);
                const y4 = this._series.priceToCoordinate(d.p4.price);
                const xMid = (x1 + x2) / 2;

                drawPoint(xMid, y3);
                drawPoint(xMid, y4);
            } else {
                // Fallback anchors for old drawings
                drawPoint(x2, y2); // SL anchor
            }
        } else {
            // Standard Rect/Line/Fib
            drawPoint(x1, y1);
            drawPoint(x2, y2);

            if (type === 'rect') {
                drawPoint(x1, y2);
                drawPoint(x2, y1);
            }
        }
    }
}

export class DrawingsPrimitive {
    constructor() {
        this._drawings = [];
        this._series = null;
        this._chart = null;
        this._selectedId = null;
        this._requestUpdate = () => { };
    }

    attached({ chart, series, requestUpdate }) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;
    }

    detached() {
        this._chart = null;
        this._series = null;
        this._requestUpdate = () => { };
    }

    setDrawings(drawings) {
        this._drawings = drawings;
        this._requestUpdate();
    }

    setSelectedId(id) {
        this._selectedId = id;
        this._requestUpdate();
    }

    paneViews() {
        if (!this._series || !this._chart) return [];
        return [{
            renderer: () => new DrawingsPaneRenderer(this._drawings, this._series, this._chart, this._selectedId),
        }];
    }
}
