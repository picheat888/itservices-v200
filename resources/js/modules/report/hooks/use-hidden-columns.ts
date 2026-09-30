/**
 * Which columns of a tabular report the reader has hidden with the column picker —
 * remembered per browser and per report in localStorage (`report.${key}.hiddenColumns`),
 * like the report's filters. Keys the definition no longer has are dropped on load, and
 * the last visible column can never be hidden.
 */
import { useEffect, useState } from 'react';
import type { TabularDefinition } from '../types';

const storageKey = (definition: TabularDefinition) => `report.${definition.key}.hiddenColumns`;

function load(definition: TabularDefinition): string[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(definition)) ?? 'null');
        if (!Array.isArray(parsed)) return [];
        const known = new Set(definition.columns.map((c) => c.key));
        const hidden = parsed.filter((k): k is string => typeof k === 'string' && known.has(k));
        // A stored set that hides everything (columns renamed underneath it) shows all instead.
        return hidden.length >= definition.columns.length ? [] : hidden;
    } catch {
        return [];
    }
}

export function useHiddenColumns(definition: TabularDefinition) {
    const [hidden, setHidden] = useState<string[]>(() => load(definition));

    useEffect(() => {
        try {
            localStorage.setItem(storageKey(definition), JSON.stringify(hidden));
        } catch {
            // Storage blocked (private window) — the choice still holds for this visit.
        }
    }, [definition, hidden]);

    const toggle = (key: string) =>
        setHidden((current) => {
            if (current.includes(key)) return current.filter((k) => k !== key);
            // Keep at least one column on screen.
            return current.length + 1 >= definition.columns.length ? current : [...current, key];
        });
    const showAll = () => setHidden([]);

    const visibleColumns = definition.columns.filter((c) => !hidden.includes(c.key));

    return { hidden, visibleColumns, toggle, showAll };
}
