// Time words for the monitor TV (12 น., 1 ชม. 12 น., 1 วัน 3 ชม.) and the server-clock offset. Pure, so node tests load it.

type Translate = (key: string) => string;

const MINUTE = 60_000;

const fill = (text: string, n: number | string) => text.replace('{n}', String(n));

/** Now on the server's clock: the TV's own clock plus the offset measured from the last board. */
export function serverNow(offsetMs: number, nowMs: number = Date.now()): number {
    return nowMs + offsetMs;
}

/** A length of time in the biggest two units, ignoring its sign. */
export function spanWords(ms: number, t: Translate): string {
    const minutes = Math.floor(Math.abs(ms) / MINUTE);
    if (minutes < 60) return fill(t('mon_min'), minutes);

    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const rest = minutes % 60;
        return rest ? `${fill(t('mon_hour'), hours)} ${fill(t('mon_min'), rest)}` : fill(t('mon_hour'), hours);
    }

    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${fill(t('mon_day'), days)} ${fill(t('mon_hour'), restHours)}` : fill(t('mon_day'), days);
}

/** "เกิน 38 น." past the deadline, "เหลือ 25 น." before it. */
export function dueWords(dueMs: number, nowMs: number, t: Translate): string {
    const left = dueMs - nowMs;
    return (left < 0 ? t('mon_over') : t('mon_left')).replace('{t}', spanWords(left, t));
}

/** How long an untaken case has waited; under a minute it has just come in. */
export function waitedWords(ms: number, t: Translate): string {
    return ms < MINUTE ? t('mon_just_in') : t('mon_waited').replace('{t}', spanWords(ms, t));
}
