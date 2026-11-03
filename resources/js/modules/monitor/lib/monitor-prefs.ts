// The monitor TV's own settings (language, mode, sound), kept in its browser and apart from any account. Pure for node tests.

export interface MonitorPrefs {
    lang: 'th' | 'en';
    theme: 'dark' | 'light';
    sound: boolean;
}

export const MONITOR_DEFAULTS: MonitorPrefs = { lang: 'th', theme: 'dark', sound: true };

/** Stored settings with anything missing or unknown replaced by its default. */
export function normalizePrefs(raw: unknown): MonitorPrefs {
    const stored = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
        lang: stored.lang === 'en' || stored.lang === 'th' ? stored.lang : MONITOR_DEFAULTS.lang,
        theme: stored.theme === 'light' || stored.theme === 'dark' ? stored.theme : MONITOR_DEFAULTS.theme,
        sound: typeof stored.sound === 'boolean' ? stored.sound : MONITOR_DEFAULTS.sound,
    };
}
