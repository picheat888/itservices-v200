import { translate } from '@/lang/translate';
import { useUiStore } from '@/stores/ui';
import { useCallback } from 'react';

export { dictionaries, translate } from '@/lang/translate';

/**
 * React hook — returns a translator function bound to the current UI language.
 */
export function useT() {
    const lang = useUiStore((s) => s.lang);
    return useCallback((key: string) => translate(lang, key), [lang]);
}
