// New Request list choices: a chosen value its reloaded list lost, and the list row the review step names (pure, node tests).

type SourceRow = { id: number; label: string };
type ManagedRow = { value: string; label_en: string; label_th?: string | null };
export type FieldChoice = SourceRow | ManagedRow;

const choiceValue = (row: FieldChoice): string => ('value' in row ? row.value : String(row.id));

/** True when the field's list exists and no longer holds the chosen value. */
export function choiceGone(raw: string, list: readonly FieldChoice[] | undefined): boolean {
    return list !== undefined && raw !== '' && !list.some((row) => choiceValue(row) === raw);
}

/** The row for the value from the first list that still holds it (the reloaded list first, then the catalog's). */
export function findChoice<T extends FieldChoice>(raw: string, ...lists: (readonly T[] | undefined)[]): T | undefined {
    for (const list of lists) {
        const row = list?.find((r) => choiceValue(r) === raw);
        if (row) {
            return row;
        }
    }
    return undefined;
}
