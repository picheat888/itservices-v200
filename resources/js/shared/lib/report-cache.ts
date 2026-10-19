// One error report per distinct key: repeats reuse the first result, and a page sends at most `max` reports.
export function createReportCache(max: number): (key: string, send: () => Promise<string | null>) => Promise<string | null> {
    const reports = new Map<string, Promise<string | null>>();

    return (key, send) => {
        const existing = reports.get(key);
        if (existing) return existing;
        if (reports.size >= max) return Promise.resolve(null);

        const report = send().catch(() => null);
        reports.set(key, report);
        return report;
    };
}
