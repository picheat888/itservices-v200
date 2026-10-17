// A name in the reader's language: Thai when the record has one, otherwise the stored name.
type Named = { name: string; name_th?: string | null };

export function localName(item: Named, lang: string): string;
export function localName(item: Named | null | undefined, lang: string): string | null;
export function localName(item: Named | null | undefined, lang: string): string | null {
    if (!item) return null;
    return (lang === 'th' && item.name_th) || item.name;
}

/** Search text that matches both languages. */
export const nameSearch = (item: Named): string => `${item.name} ${item.name_th ?? ''}`.trim();
