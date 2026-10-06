/**
 * Which columns of a tabular report the reader has hidden with the column picker —
 * remembered per browser and per report in localStorage (`report.${key}.hiddenColumns.v2`),
 * like the report's filters. Keys the definition no longer has are dropped on load, and
 * the last visible column can never be hidden. Until the reader has chosen, the columns the
 * report marks `hidden` (ReportColumn::hiddenByDefault) start hidden.
 *
 * Saved only when the reader toggles a column. The first version wrote on every visit, so a
 * reader who had merely opened a report "chose" to hide nothing and never got a later default;
 * `.v2` leaves those automatic saves behind (pre-go-live: no migration of the old key).
 */
import { useState } from 'react';
import type { TabularDefinition } from '../types';

const storageKey = (definition: TabularDefinition) => `report.${definition.key}.hiddenColumns.v2`;

function load(definition: TabularDefinition): string[] {
    try {
        const stored = localStorage.getItem(storageKey(definition));
        // Nothing chosen yet: the report's own defaults.
        if (stored === null) return definition.columns.filter((c) => c.hidden).map((c) => c.key);
        const parsed: unknown = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [];
        const known = new Set(definition.columns.map((c) => c.key));
        const hidden = parsed.filter((k): k is string => typeof k === 'string' && known.has(k));
        // A stored set that hides everything (columns renamed underneath it) shows all instead.
        return hidden.length >= definition.columns.length ? [] : hidden;
    } catch {
        return [];
    }
}

function save(definition: TabularDefinition, hidden: string[]): void {
    try {
        localStorage.setItem(storageKey(definition), JSON.stringify(hidden));
    } catch {
        // Storage blocked (private window) — the choice still holds for this visit.
    }
}

export function useHiddenColumns(definition: TabularDefinition) {
    const [hidden, setHidden] = useState<string[]>(() => load(definition));

    const choose = (next: string[]) => {
        setHidden(next);
        save(definition, next);
    };

    const toggle = (key: string) => {
        if (hidden.includes(key)) return choose(hidden.filter((k) => k !== key));
        // Keep at least one column on screen.
        if (hidden.length + 1 >= definition.columns.length) return;
        choose([...hidden, key]);
    };
    /** Back to the report's own choice: its hidden-by-default columns hidden, the rest shown. */
    const reset = () => choose(definition.columns.filter((c) => c.hidden).map((c) => c.key));

    const visibleColumns = definition.columns.filter((c) => !hidden.includes(c.key));

    return { hidden, visibleColumns, toggle, reset };
}
