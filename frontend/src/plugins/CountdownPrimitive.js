import { toChartSeconds, timeframeToSeconds } from '../utils/time';

export class CountdownPrimitive {
    constructor(options) {
        this._options = options || {};
        this._timeframe = this._options.timeframe || '1h';
        this._timezone = this._options.timezone || 'Asia/Shanghai';
        this._colors = this._options.colors || { up: '#26a69a', down: '#ef5350' };
        this._series = null;
        this._chart = null;
        this._intervalId = null;
        this._requestUpdate = () => { };
    }

    attached({ chart, series, requestUpdate }) {
        this._chart = chart;
        this._series = series;
        this._requestUpdate = requestUpdate;

        this._intervalId = setInterval(() => {
            if (this._chart && this._series) {
                this._requestUpdate();
            }
        }, 1000);
    }

    detached() {
        if (this._intervalId) {
            clearInterval(this._intervalId);
        }
        this._chart = null;
        this._series = null;
        this._requestUpdate = () => { };
    }

    updateOptions(options) {
        if (options.timeframe) this._timeframe = options.timeframe;
        if (options.timezone) this._timezone = options.timezone;
        if (options.colors) this._colors = options.colors;
        this._requestUpdate();
    }

    priceAxisViews() {
        if (!this._series || !this._chart) return [];
        return [{
            coordinate: () => {
                if (!this._series || !this._chart) return null;
                try {
                    const data = this._series.data();
                    if (data.length === 0) return null;
                    const lastBar = data[data.length - 1];
                    const y = this._series.priceToCoordinate(lastBar.close);
                    return y; // Position exactly at price level
                } catch (e) {
                    return null;
                }
            },
            text: () => {
                if (!this._series || !this._chart) return '';
                try {
                    const data = this._series.data();
                    if (data.length === 0) return '';
                    const lastBar = data[data.length - 1];

                    const intervalSeconds = timeframeToSeconds(this._timeframe);

                    // Use chart timezone (shifted) for proper countdown
                    const now = toChartSeconds(Date.now(), this._timezone);
                    const nextBarTime = lastBar.time + intervalSeconds;
                    let remaining = nextBarTime - now;

                    if (remaining < 0) remaining = 0;

                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    const s = remaining % 60;

                    let timerText = '';
                    if (h > 0) timerText += `${h}:`;
                    timerText += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                    // Format Price
                    const priceFormatted = this._series.priceFormatter().format(lastBar.close);

                    // Combine: "Price  Countdown"
                    return `${priceFormatted}   ${timerText}`;
                } catch (e) {
                    return '';
                }
            },
            textColor: () => '#FFFFFF',
            backColor: () => {
                // Dynamic color based on last candle's direction
                if (!this._series) return '#2962FF';
                const data = this._series.data();
                if (data.length === 0) return '#2962FF';
                const lastBar = data[data.length - 1];
                return lastBar.close >= lastBar.open ? this._colors.up : this._colors.down;
            },
        }];
    }
}
