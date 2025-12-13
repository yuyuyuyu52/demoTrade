
import { LineStyle } from 'lightweight-charts';

class FVGsPaneRenderer {
    constructor(fvgs, series, chart) {
        this._fvgs = fvgs;
        this._series = series;
        this._chart = chart;
    }

    draw(target) {
        target.useBitmapCoordinateSpace(scope => {
            const ctx = scope.context;
            const timeScale = this._chart.timeScale();

            const horizontalPixelRatio = scope.horizontalPixelRatio || 1;
            const verticalPixelRatio = scope.verticalPixelRatio || 1;

            ctx.save();
            ctx.scale(horizontalPixelRatio, verticalPixelRatio);

            this._fvgs.forEach(fvg => {
                // fvg: { time, top, bottom, type }

                // 1. Get x1 from time
                const x1 = timeScale.timeToCoordinate(fvg.time);

                // If x1 is null, it might be off-screen.
                // But we still need to draw if the extension is visible.
                // However, timeToCoordinate returning null usually means we can't map it.
                // Let's try to map it even if offscreen?
                // Actually, if it's null, we can't get logical index easily.

                if (x1 === null) {
                    // Start of FVG is off-screen or invalid. 
                    // Ideally we should clamp it to screen edge if visible range > fvg.time
                    // For now, safe return to prevent crash
                    return;
                }

                // 2. Calculate x2 (20 candles forward)
                // Convert x1 to logical index
                const logical1 = timeScale.coordinateToLogical(x1);
                if (logical1 === null) return;

                const logical2 = logical1 + 20;
                const x2 = timeScale.logicalToCoordinate(logical2);
                if (x2 === null) return;

                // 3. Get y coordinates
                const y1 = this._series.priceToCoordinate(fvg.top);
                const y2 = this._series.priceToCoordinate(fvg.bottom);

                if (y1 === null || y2 === null) return;

                // Draw Rect
                const w = x2 - x1;
                const h = y2 - y1;

                ctx.beginPath();
                if (fvg.type === 'bullish') {
                    // Greenish - More opaque for visibility
                    ctx.fillStyle = 'rgba(0, 230, 118, 0.4)';
                    ctx.strokeStyle = 'rgba(0, 230, 118, 0.8)';
                } else {
                    // Reddish - More opaque for visibility
                    ctx.fillStyle = 'rgba(255, 82, 82, 0.4)';
                    ctx.strokeStyle = 'rgba(255, 82, 82, 0.8)';
                }

                ctx.lineWidth = 1;
                ctx.rect(x1, y1, w, h);
                ctx.fill();
                // ctx.stroke(); // Optional stroke
            });

            ctx.restore();
        });
    }
}

export class FVGPrimitive {
    constructor() {
        this._fvgs = [];
        this._series = null;
        this._chart = null;
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

    setFVGs(fvgs) {
        this._fvgs = fvgs;
        this._requestUpdate();
    }

    paneViews() {
        if (!this._series || !this._chart) return [];
        return [{
            renderer: () => new FVGsPaneRenderer(this._fvgs, this._series, this._chart),
        }];
    }
}
