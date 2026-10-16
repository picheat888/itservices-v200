// Pure query-string helpers for a URL-held dialog (`?dialog=`) and the companion params that travel with it.
// Kept free of React so node tests can load it.

export const PROFILE_SECTION_PARAM = 'section';

/** The current query with `params` set over it (other keys kept, in order), as a `?…` string or `''`. */
export function mergeDialogSearch(currentSearch: string, params: Record<string, string>): string {
    const next = new URLSearchParams(currentSearch);
    Object.entries(params).forEach(([key, value]) => next.set(key, value));
    const query = next.toString();
    return query === '' ? '' : `?${query}`;
}

/** A copy of `params` without `dialog` and the dialog's companion params. */
export function dialogCloseParams(params: URLSearchParams, companions: readonly string[]): URLSearchParams {
    const next = new URLSearchParams(params);
    next.delete('dialog');
    companions.forEach((key) => next.delete(key));
    return next;
}
