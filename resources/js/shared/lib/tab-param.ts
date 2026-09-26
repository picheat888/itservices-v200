/**
 * Reads a module page's `?tab=` value, translating names a tab used to have.
 *
 * The first tab of every Workspace module was called "dashboard" until it was renamed
 * "overview" (2026-09-25). Bookmarks, shared links and old mails still carry `?tab=dashboard`,
 * so they land on the Overview tab instead of falling back to the page's default.
 */
const RENAMED_TABS: Record<string, string> = {
    dashboard: 'overview',
};

export function readTabParam(value: string | null): string | null {
    return value !== null && value in RENAMED_TABS ? RENAMED_TABS[value] : value;
}
