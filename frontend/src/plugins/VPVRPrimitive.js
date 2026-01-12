
import { LineStyle } from 'lightweight-charts';

class VPVRPaneRenderer {
    constructor(data, series, chart, width, colorOptions) {
        this._data = data || {};
        this._series = series;
        this._chart = chart;
        this._width = width || 80;
        this._colorOptions = colorOptions || {
            up: 'rgba(0, 150, 136, 0.3)',
            down: 'rgba(255, 82, 82, 0.3)',
            upHighlight: 'rgba(0, 150, 136, 0.6)',
            downHighlight: 'rgba(255, 82, 82, 0.6)',
            poc: '#FFD700', // Gold
            vah: '#1E88E5', // Blue
            val: '#1E88E5', // Blue
        };
    }

    draw(target) {
        target.useBitmapCoordinateSpace(scope => {
            const ctx = scope.context;
            // const timeScale = this._chart.timeScale(); 

            const horizontalPixelRatio = scope.horizontalPixelRatio || 1;
            const verticalPixelRatio = scope.verticalPixelRatio || 1;

            ctx.save();
            ctx.scale(horizontalPixelRatio, verticalPixelRatio);

            const mediaSize = scope.mediaSize;
            const chartWidth = mediaSize.width;

            const buckets = this._data.buckets || [];
            if (buckets.length === 0) {
                ctx.restore();
                return;
            }

            // Find max volume
            let maxVol = 0;
            buckets.forEach(row => {
                if (row.totalVolume > maxVol) maxVol = row.totalVolume;
            });

            if (maxVol === 0) {
                ctx.restore();
                return;
            }

            const { poc, vah, val } = this._data;

            buckets.forEach(row => {
                const yTop = this._series.priceToCoordinate(row.price + row.step / 2);
                const yBottom = this._series.priceToCoordinate(row.price - row.step / 2);

                if (yTop === null || yBottom === null) return;

                const barWidth = (row.totalVolume / maxVol) * this._width;
                const h = Math.abs(yBottom - yTop);
                const height = Math.max(1, h);
                const y = Math.min(yTop, yBottom);

                // Value Area Check
                const isValueArea = (row.price <= vah && row.price >= val);

                // Colors
                let colorUp = this._colorOptions.up;
                let colorDown = this._colorOptions.down;

                if (isValueArea) {
                    colorUp = this._colorOptions.upHighlight || colorUp;
                    colorDown = this._colorOptions.downHighlight || colorDown;
                }

                const wDown = (row.downVolume / maxVol) * this._width;
                const wUp = (row.upVolume / maxVol) * this._width;

                const xEdge = chartWidth;
                const xBuyStart = xEdge - wUp;
                const xSellStart = xBuyStart - wDown;

                // Draw Sell
                ctx.fillStyle = colorDown;
                ctx.fillRect(xSellStart, y, wDown, height);

                // Draw Buy
                ctx.fillStyle = colorUp;
                ctx.fillRect(xBuyStart, y, wUp, height);
            });

            // Draw Lines (POC, VAH, VAL)
            // Use line width 1 or 2

            const drawLine = (price, color, width = 1) => {
                if (price === undefined || price === null) return;
                const y = this._series.priceToCoordinate(price);
                if (y === null) return;

                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                // Draw across the VPVR width? Or entire chart? 
                // User requirement implies "Attributes", usually entire chart extension or at least clearly visible.
                // Let's draw across the VPVR width + a bit more? Or full chart.
                // Let's do Full Width for lines to be useful benchmarks.
                ctx.moveTo(0, y);
                ctx.lineTo(chartWidth, y);
                ctx.stroke();

                // Label?
                ctx.font = '10px sans-serif';
                ctx.fillStyle = color;
                ctx.fillText(price.toFixed(2), chartWidth - this._width - 40, y - 2);
            };

            if (vah) drawLine(vah, this._colorOptions.vah, 1);
            if (val) drawLine(val, this._colorOptions.val, 1);
            if (poc) drawLine(poc, this._colorOptions.poc, 2);

            ctx.restore();
        });
    }
}

export class VPVRPrimitive {
    constructor(options = {}) {
        this._data = { buckets: [], poc: null, vah: null, val: null };
        this._series = null;
        this._chart = null;
        this._width = options.width || 80;
        this._colors = options.colors || undefined;
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

    setProfileData(data) {
        this._data = data;
        this._requestUpdate();
    }

    setOptions(options) {
        if (options.width) this._width = options.width;
        if (options.colors) this._colors = { ...this._colors, ...options.colors };
        this._requestUpdate();
    }

    paneViews() {
        if (!this._series || !this._chart) return [];
        return [{
            renderer: () => new VPVRPaneRenderer(this._data, this._series, this._chart, this._width, this._colors),
            zIndex: 1,
        }];
    }
}
