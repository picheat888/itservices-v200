// The number formatter for the reader's language.
import { useCallback } from 'react';
import { formatNumber, type NumberOptions } from '@/shared/lib/number';
import { useUiStore } from '@/stores/ui';

export function useNumberFormat() {
    const lang = useUiStore((s) => s.lang);
    return useCallback((value: number, options?: NumberOptions) => formatNumber(value, lang, options), [lang]);
}
