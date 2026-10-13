// Date formatting bound to the system date setting and the reader's language.
import { bindDateFormat, type DateFormatter } from '@/shared/lib/datetime';
import { useUiStore } from '@/stores/ui';
import { useMemo } from 'react';

export function useDateFormat(): DateFormatter {
    const config = useUiStore((s) => s.dateConfig);
    const lang = useUiStore((s) => s.lang);
    return useMemo(() => bindDateFormat(config, lang), [config, lang]);
}

/** For code outside components; call it where the text is built, never at module load. */
export function currentDateFormat(): DateFormatter {
    const { dateConfig, lang } = useUiStore.getState();
    return bindDateFormat(dateConfig, lang);
}
