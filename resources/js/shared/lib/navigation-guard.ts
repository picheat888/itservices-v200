// Which moves an unsaved-changes navigation guard stops: a new path, or a change to one of the watched ?params.

/** True when going from `from` to `to` leaves the page or changes a param the guard watches. */
export function isGuardedMove(from: URL, to: URL, watchParams: readonly string[]): boolean {
    if (from.origin !== to.origin || from.pathname !== to.pathname) return true;
    return watchParams.some((key) => from.searchParams.get(key) !== to.searchParams.get(key));
}

/** The click a router link would handle itself: main button, no modifier keys, same tab, no download. */
export function isPlainLinkClick(
    event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean },
    anchor: { target: string; hasAttribute: (name: string) => boolean },
): boolean {
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (anchor.target !== '' && anchor.target !== '_self') return false;
    return !anchor.hasAttribute('download');
}
