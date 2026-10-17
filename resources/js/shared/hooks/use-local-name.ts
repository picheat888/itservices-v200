// Returns localName() bound to the current UI language.
import { localName, localPair } from '@/shared/lib/local-name';
import { useUiStore } from '@/stores/ui';

export function useLocalName() {
    const lang = useUiStore((s) => s.lang);
    return (item: { name: string; name_th?: string | null }) => localName(item, lang);
}

export function useLocalPair() {
    const lang = useUiStore((s) => s.lang);
    return (name: string | null | undefined, nameTh: string | null | undefined) => localPair(name, nameTh, lang);
}
