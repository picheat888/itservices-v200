// Calendar days from today to a warranty or lease end date (YYYY-MM-DD), counted on the viewer's own calendar.
export function coverDaysLeft(coverEnd: string, now: Date = new Date()): number {
    const [y, m, d] = coverEnd.split('-').map(Number);
    const end = Date.UTC(y, m - 1, d);
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((end - today) / 86_400_000);
}
