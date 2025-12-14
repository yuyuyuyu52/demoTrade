export const TIMEZONE = 'America/New_York';

export const timeframeToSeconds = (tf) => {
    switch (tf) {
        case '1m': return 60;
        case '3m': return 3 * 60;
        case '5m': return 5 * 60;
        case '15m': return 15 * 60;
        case '30m': return 30 * 60;
        case '1h': return 60 * 60;
        case '2h': return 2 * 60 * 60;
        case '4h': return 4 * 60 * 60;
        case '6h': return 6 * 60 * 60;
        case '8h': return 8 * 60 * 60;
        case '12h': return 12 * 60 * 60;
        case '1d': return 24 * 60 * 60;
        case '3d': return 3 * 24 * 60 * 60;
        case '1w': return 7 * 24 * 60 * 60;
        case '1M': return 30 * 24 * 60 * 60;
        default: return 60 * 60; // fallback 1h
    }
};

// Convert UTC ms timestamp to Unix seconds (UTC)
// The chart library will handle the timezone display based on the 'localization.timezone' config.
export const toNySeconds = (ms) => Math.floor(ms / 1000);

