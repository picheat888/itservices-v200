// Which moves an unsaved-changes navigation guard stops: a new path, or a change to one of the watched ?params.

const isWebLink = (url: URL) => url.protocol === 'http:' || url.protocol === 'https:';

/** True when an in-app move leaves the page or changes a watched param; mailto:/tel: and other origins are left to beforeunload. */
export function isGuardedMove(from: URL, to: URL, watchParams: readonly string[]): boolean {
    if (!isWebLink(to) || from.origin !== to.origin) return false;
    if (from.pathname !== to.pathname) return true;
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
