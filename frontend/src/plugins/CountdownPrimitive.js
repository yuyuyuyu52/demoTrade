
const TIMEZONE = 'America/New_York';

const getTzOffsetSeconds = (ms, timeZone = TIMEZONE) => {
    const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

    const parts = dtf.formatToParts(new Date(ms));
    const filled = {};
    for (const { type, value } of parts) {
        filled[type] = value;
    }
    const asUTC = Date.UTC(
        Number(filled.year),
        Number(filled.month) - 1,
        Number(filled.day),
        Number(filled.hour),
        Number(filled.minute),
        Number(filled.second),
    );

    return (asUTC - ms) / 1000;
};

const toNySeconds = (ms) => Math.round(ms / 1000 + getTzOffsetSeconds(ms, TIMEZONE));

export class CountdownPrimitive {
    constructor(options) {
        this._options = options || {};
        this._timeframe = this._options.timeframe || '1h';
        this._series = null;
        this._chart = null;
        this._intervalId = null;
        this._requestUpdate = () => {};
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
        this._requestUpdate = () => {};
    }

    updateTimeframe(timeframe) {
        this._timeframe = timeframe;
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
                    if (y === null) return null;
                    return y + 25; // Shift down to avoid overlapping with the current price label
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
                    
                    let intervalSeconds = 3600; // Default 1h
                    const tf = this._timeframe;
                    if (tf === '1m') intervalSeconds = 60;
                    else if (tf === '3m') intervalSeconds = 3 * 60;
                    else if (tf === '5m') intervalSeconds = 5 * 60;
                    else if (tf === '15m') intervalSeconds = 15 * 60;
                    else if (tf === '30m') intervalSeconds = 30 * 60;
                    else if (tf === '1h') intervalSeconds = 60 * 60;
                    else if (tf === '2h') intervalSeconds = 2 * 60 * 60;
                    else if (tf === '4h') intervalSeconds = 4 * 60 * 60;
                    else if (tf === '6h') intervalSeconds = 6 * 60 * 60;
                    else if (tf === '8h') intervalSeconds = 8 * 60 * 60;
                    else if (tf === '12h') intervalSeconds = 12 * 60 * 60;
                    else if (tf === '1d') intervalSeconds = 24 * 60 * 60;
                    else if (tf === '3d') intervalSeconds = 3 * 24 * 60 * 60;
                    else if (tf === '1w') intervalSeconds = 7 * 24 * 60 * 60;
                    else if (tf === '1M') intervalSeconds = 30 * 24 * 60 * 60;
                    
                    // Use New York time for countdown to align with chart timestamps
                    const now = toNySeconds(Date.now());
                    const nextBarTime = lastBar.time + intervalSeconds;
                    let remaining = nextBarTime - now;
                    
                    if (remaining < 0) remaining = 0;
                    
                    const h = Math.floor(remaining / 3600);
                    const m = Math.floor((remaining % 3600) / 60);
                    const s = remaining % 60;
                    
                    let text = '';
                    if (h > 0) text += `${h}:`;
                    text += `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    return text;
                } catch (e) {
                    return '';
                }
            },
            textColor: () => '#FFFFFF',
            backColor: () => '#2962FF',
        }];
    }
}
