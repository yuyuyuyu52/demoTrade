
import { LineStyle } from 'lightweight-charts';

class DrawingsPaneRenderer {
    constructor(drawings, series, chart, selectedId, interval) {
        this._drawings = drawings;
        this._series = series;
        this._chart = chart;
        this._selectedId = selectedId;
        this._interval = interval || 60; // Default to 1m if missing
    }

    _getClosestTimeCoordinate(timeScale, targetTime) {
        if (targetTime === undefined || targetTime === null) return null;

        // Ensure strictly numeric comparison
        const tTime = Number(targetTime);
        if (isNaN(tTime)) return null;

        const data = this._series.data();
        if (!data || data.length === 0) {
            return null;
        }

        const lastBar = data[data.length - 1];
        const lastTime = Number(lastBar.time);

        // 1. Future Time: Calculate pixel position manually
        // LWC's logicalToCoordinate returns 0 for out-of-range indices, so we must calculate ourselves
        if (tTime > lastTime) {
            const lastBarCoord = timeScale.timeToCoordinate(lastBar.time);
            if (lastBarCoord === null) return null;

            // Calculate pixels per bar from the last two data points
            let pixelsPerBar = 10; // Default fallback
            if (data.length >= 2) {
                const prevBar = data[data.length - 2];
                const prevBarCoord = timeScale.timeToCoordinate(prevBar.time);
                if (prevBarCoord !== null) {
                    pixelsPerBar = lastBarCoord - prevBarCoord;
                }
            }

            // Calculate how many "bars" into the future
            const timeDiff = tTime - lastTime;
            const interval = this._interval || 60;
            const barsDiff = timeDiff / interval;

            // Simply add the pixel offset to the last bar's coordinate
            const targetCoord = lastBarCoord + (barsDiff * pixelsPerBar);

            return targetCoord;
        }

        // 2. Present/Past: Try direct conversion
        try {
            const coord = timeScale.timeToCoordinate(tTime);
            if (coord !== null) return coord;
        } catch (e) { }

        // 3. Past Time (but timeToCoordinate failed, likely due to zoom/gaps/not exact bar match)
        // We linear interpolate between the two closest bars.
        try {
            // Binary search to find the index of the bar <= tTime
            let left = 0;
            let right = data.length - 1;
            let leftIndex = -1;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                const midTime = Number(data[mid].time);

                if (midTime === tTime) return timeScale.timeToCoordinate(tTime);

                if (midTime < tTime) {
                    leftIndex = mid;
                    left = mid + 1;
                } else {
                    right = mid - 1;
                }
            }

            // Before first bar?
            if (leftIndex === -1) {
                // Extrapolate backwards from first bar
                const firstBar = data[0];
                const firstTime = Number(firstBar.time);
                const firstBarCoord = timeScale.timeToCoordinate(firstBar.time);

                if (firstBarCoord !== null) {
                    const firstBarLogical = timeScale.coordinateToLogical(firstBarCoord);
                    if (firstBarLogical !== null) {
                        const interval = this._interval || 60;
                        const timeDiff = tTime - firstTime; // negative
                        const logicalDiff = timeDiff / interval;
                        return timeScale.logicalToCoordinate(firstBarLogical + logicalDiff);
                    }
                }
                return null;
            }

            // Between bars? Interpolate.
            if (leftIndex >= 0 && leftIndex < data.length - 1) {
                const leftBar = data[leftIndex];
                const rightBar = data[leftIndex + 1];
                const leftTime = Number(leftBar.time);
                const rightTime = Number(rightBar.time);

                const leftX = timeScale.timeToCoordinate(leftBar.time);
                const rightX = timeScale.timeToCoordinate(rightBar.time);

                if (leftX !== null && rightX !== null) {
                    const ratio = (tTime - leftTime) / (rightTime - leftTime);
                    return leftX + (rightX - leftX) * ratio;
                }
            }

            // Fallback: Snap to the found left bar
            if (leftIndex >= 0) {
                return timeScale.timeToCoordinate(data[leftIndex].time);
            }
        } catch (e) {
            console.error("Coordinate calculation error", e);
        }

        return null;
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
                let x2 = this._getClosestTimeCoordinate(timeScale, d.p2.time);
                const y2 = this._series.priceToCoordinate(d.p2.price);

                if (x1 === null || y1 === null || x2 === null || y2 === null) return;

                // FIX: Enforce minimum visual width for box-based drawings to prevent disappearing on higher timeframes
                // When switching to higher timeframes, start and end times might snap to the same bar, causing 0 width.
                if (['rect', 'long', 'short'].includes(d.type)) {
                    if (Math.abs(x2 - x1) < 5) {
                        x2 = x1 + (x2 >= x1 ? 10 : -10);
                    }
                }

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
                    this._drawAnchors(ctx, x1, y1, x2, y2, d.type, d);
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
        // x2, y2 is Stop Loss (visually) - we use x2 for width

        let targetY;

        if (d && d.p3) {
            // Apply bounds check/validation if needed
            targetY = this._series.priceToCoordinate(d.p3.price);
            if (targetY === null) {
                const yDiff = y2 - y1;
                targetY = y1 - yDiff * 2;
            }
        } else {
            // Fallback calculation for old drawings or during creation
            const yDiff = y2 - y1;
            targetY = y1 - yDiff * 2;
        }

        // Draw Stop Loss Box (Red)
        ctx.fillStyle = 'rgba(255, 82, 82, 0.2)';
        ctx.strokeStyle = '#FF5252';
        ctx.beginPath();
        // Box from Entry (y1) to SL (y2), Width is x2 - x1
        ctx.rect(x1, y1, x2 - x1, y2 - y1);
        ctx.fill();
        ctx.stroke();

        // Draw Take Profit Box (Green)
        ctx.fillStyle = 'rgba(0, 230, 118, 0.2)';
        ctx.strokeStyle = '#00E676';
        ctx.beginPath();
        // Box from Entry (y1) to Target (targetY)
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
        ctx.fillStyle = '#00E676';
        ctx.font = '12px sans-serif';
        // Ensure coords are valid numbers
        if (!isNaN(x2) && !isNaN(targetY)) {
            ctx.fillText('Target', x2 + 5, targetY);
        }

        ctx.fillStyle = '#FF5252';
        if (!isNaN(x2) && !isNaN(y2)) {
            ctx.fillText('Stop', x2 + 5, y2);
        }

        // Draw Risk/Reward Ratio
        // Risk = |Entry - SL|, Reward = |Target - Entry|
        // Use coordinates to calculate ratio visually or price if available
        // Using coordinates is easier for drawing
        const entryY = y1;
        const slY = y2;
        const tpY = targetY;

        if (!isNaN(entryY) && !isNaN(slY) && !isNaN(tpY)) {
            const risk = Math.abs(entryY - slY);
            const reward = Math.abs(tpY - entryY);

            if (risk > 0) {
                const ratio = reward / risk;
                const ratioText = `${ratio.toFixed(2)}`;

                ctx.fillStyle = 'black';
                ctx.font = 'bold 12px sans-serif';
                ctx.textAlign = 'center';
                // Draw in the middle of the box width, on the boundary line between Entry and SL?
                // Request said "on the boundary line" (wait, "on the boundary line between bull/bear"? No, "on the boundary line display ratio")
                // Usually it's displayed in the middle of the drawing. Let's put it in the middle of the SL/TP divider (Entry Line) or just below it.
                // User said "display on boundary line... black... no line under it".
                // I'll put it on the Entry line (y1), centered horizontally.
                const centerX = (x1 + x2) / 2;
                ctx.fillText(ratioText, centerX, y1 + 4); // Slightly below entry line to not overlap too much? Or slightly above?
                // Let's try slightly above centered.
                ctx.textAlign = 'left'; // Reset
            }
        }
    }

    _drawAnchors(ctx, x1, y1, x2, y2, type, d) {
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
            // Anchor 0: Entry Point (Left) - p1
            drawPoint(x1, y1);

            // Anchor 1: SL Point (Right) - p2
            drawPoint(x2, y2);

            // Anchor 2: Target Point (Right) - p3
            let targetY;
            if (d && d.p3) {
                targetY = this._series.priceToCoordinate(d.p3.price);
                if (targetY === null) {
                    const yDiff = y2 - y1;
                    targetY = y1 - yDiff * 2;
                }
            } else {
                const yDiff = y2 - y1;
                targetY = y1 - yDiff * 2;
            }

            if (targetY !== null && !isNaN(targetY)) {
                drawPoint(x2, targetY);
            }

            // Anchor 3: Width Control (Right Entry)
            drawPoint(x2, y1);

        } else {
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
        this._interval = 60;
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

    setInterval(interval) {
        this._interval = interval;
        this._requestUpdate();
    }

    paneViews() {
        if (!this._series || !this._chart) return [];
        return [{
            renderer: () => new DrawingsPaneRenderer(this._drawings, this._series, this._chart, this._selectedId, this._interval),
        }];
    }
}
