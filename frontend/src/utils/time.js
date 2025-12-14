export const TIMEZONE = 'Asia/Shanghai';

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

// Cache DateTimeFormat instances for performance
const dtfCache = {};

// Get timezone offset in seconds for a given timestamp (ms) and IANA timezone
export const getTzOffsetSeconds = (ms, timeZone) => {
    if (!dtfCache[timeZone]) {
        dtfCache[timeZone] = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    }
    const dtf = dtfCache[timeZone];

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

// Convert UTC ms timestamp to chart seconds shifted to a specific timezone
export const toChartSeconds = (ms, timeZone) => Math.floor(ms / 1000 + getTzOffsetSeconds(ms, timeZone));

// Legacy helper (uses default TIMEZONE constant) - kept for backward compatibility
export const toNySeconds = (ms) => toChartSeconds(ms, TIMEZONE);

// Convert Chart seconds (shifted) back to UTC seconds
export const toUTCSeconds = (chartSeconds, timeZone) => {
    // 1. Initial guess: assuming chartSeconds is close to UTC
    const guessMs = chartSeconds * 1000;
    const offset1 = getTzOffsetSeconds(guessMs, timeZone);

    // 2. Refine: UTC = Chart - Offset
    const estimatedUTC = chartSeconds - offset1;
    const estimatedMs = estimatedUTC * 1000;
    const offset2 = getTzOffsetSeconds(estimatedMs, timeZone);

    // If offset matches, we are good
    if (offset1 === offset2) return estimatedUTC;

    // Otherwise use the refined offset
    return chartSeconds - offset2;
};


