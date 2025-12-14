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

        const getData = () => {
            if (!this._series || !this._chart) return null;
            try {
                const data = this._series.data();
                if (data.length === 0) return null;
                const lastBar = data[data.length - 1];
                const y = this._series.priceToCoordinate(lastBar.close);
                return { lastBar, y };
            } catch (e) {
                return null;
            }
        };

        const getColor = () => {
            const d = getData();
            if (!d) return '#2962FF';
            return d.lastBar.close >= d.lastBar.open ? this._colors.up : this._colors.down;
        };

        return [
            // View 1: Price
            {
                coordinate: () => {
                    const d = getData();
                    return d ? d.y : null;
                },
                text: () => {
                    const d = getData();
                    if (!d) return '';
                    return this._series.priceFormatter().format(d.lastBar.close);
                },
                textColor: () => '#FFFFFF',
                backColor: getColor,
            },
            // View 2: Countdown (Below Price)
            {
                coordinate: () => {
                    const d = getData();
                    // Offset by ~22px to place below price label
                    return d ? d.y + 22 : null;
                },
                text: () => {
                    const d = getData();
                    if (!d) return '';

                    const intervalSeconds = timeframeToSeconds(this._timeframe);
                    // Use chart timezone (shifted) for proper countdown
                    const now = toChartSeconds(Date.now(), this._timezone);
                    const nextBarTime = d.lastBar.time + intervalSeconds;
                    let remaining = nextBarTime - now;

                    if (remaining < 0) remaining = 0;

                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    const s = remaining % 60;

                    let timerText = '';
                    if (h > 0) timerText += `${h}:`;
                    timerText += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                    return timerText;
                },
                textColor: () => '#FFFFFF',
                backColor: getColor,
            }
        ];
    }
}
