// The translation keys a push's text can use; the service worker build keeps only these from the lang files.
// Pure (no imports) so vite.sw.config.js and node tests can load it.

const BELL_KEY = /^(notif_|notification_name_|notification_push_|req_[a-z]+$|req_auto_title(_for)?$|req_origin_onboarding$|rep_\w+_title$)/;

export function isBellKey(key: string): boolean {
    return BELL_KEY.test(key);
}
