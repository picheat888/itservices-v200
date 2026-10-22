// The browser tab title with the unread bell count in front ("(3) Tickets - Brand", "(99+) …" above 99).
// Pure (no imports) so node tests can load it.

export const TITLE_COUNT_CAP = 99;

export function titleWithCount(title: string, unread: number): string {
    if (!Number.isFinite(unread) || unread <= 0) return title;
    const count = unread > TITLE_COUNT_CAP ? `${TITLE_COUNT_CAP}+` : String(Math.floor(unread));

    return `(${count}) ${title}`;
}
