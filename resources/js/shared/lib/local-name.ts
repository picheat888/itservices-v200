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

/** localName for an API field pair (`department` + `department_th`); null when there is no name. */
export const localPair = (name: string | null | undefined, nameTh: string | null | undefined, lang: string): string | null =>
    name ? localName({ name, name_th: nameTh }, lang) : null;
