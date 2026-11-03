// The monitor TV's language, mode and sound, saved in this browser only; useMonitorT translates in the TV's own language.
import { translate } from '@/lang/translate';
import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MONITOR_DEFAULTS, normalizePrefs, type MonitorPrefs } from '../lib/monitor-prefs';

interface PrefsState extends MonitorPrefs {
    set: (next: Partial<MonitorPrefs>) => void;
}

export const useMonitorPrefs = create<PrefsState>()(
    persist((set) => ({ ...MONITOR_DEFAULTS, set: (next) => set(next) }), {
        name: 'itsd.monitor.prefs',
        partialize: (s) => ({ lang: s.lang, theme: s.theme, sound: s.sound }),
        merge: (persisted, current) => ({ ...current, ...normalizePrefs(persisted) }),
    }),
);

/** Like useT, but in the TV's language rather than the signed-in reader's. */
export function useMonitorT() {
    const lang = useMonitorPrefs((s) => s.lang);
    return useCallback((key: string) => translate(lang, key), [lang]);
}
