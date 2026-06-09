import { useT } from '@/lib/i18n';
import type { OrgDir } from '@/lib/org-tree';
import { cn } from '@/lib/utils';
import { Maximize2, Search, X } from 'lucide-react';
import { useMemo } from 'react';

interface OrgStats {
    total: number;
    levels: number;
    managers: number;
}

/** Lightweight person record for the search suggestion list. */
export interface OrgPerson {
    id: number;
    label: string;
    code: string;
    dept: string;
    color: string;
}

/**
 * Org chart toolbar — stats (visible / levels / managers) on the left; on the
 * right a search box that dims non-matching cards AND drops a suggestion list
 * (closest name / code / department) you can click to jump to a person, a
 * vertical/horizontal layout toggle, collapse/expand-all, and fit-to-screen.
 */
export function OrgChartToolbar({
    stats,
    query,
    onQueryChange,
    people,
    onPick,
    dir,
    onDirChange,
    anyCollapsed,
    onToggleAll,
    onFit,
}: {
    stats: OrgStats;
    query: string;
    onQueryChange: (q: string) => void;
    people: OrgPerson[];
    onPick: (id: number) => void;
    dir: OrgDir;
    onDirChange: (d: OrgDir) => void;
    anyCollapsed: boolean;
    onToggleAll: () => void;
    onFit: () => void;
}) {
    const t = useT();

    const q = query.trim().toLowerCase();
    const suggestions = useMemo(() => {
        if (!q) {
            return [];
        }
        return people.filter((p) => `${p.label} ${p.code} ${p.dept}`.toLowerCase().includes(q)).slice(0, 6);
    }, [q, people]);

    const stat = (num: number, label: string) => (
        <div className="flex flex-col items-center justify-center px-4">
            <span className="font-mono text-lg font-extrabold leading-none tracking-tight text-foreground">{num}</span>
            <span className="mt-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground">{label}</span>
        </div>
    );

    return (
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-3">
            {/* Stats */}
            <div className="flex items-stretch">
                {stat(stats.total, t('org_total'))}
                <span className="my-1 w-px bg-border" />
                {stat(stats.levels, t('org_levels'))}
                <span className="my-1 w-px bg-border" />
                {stat(stats.managers, t('org_managers'))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* Search with suggestion dropdown */}
                <div className="relative">
                    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 focus-within:border-brand">
                        <Search className="h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            value={query}
                            onChange={(e) => onQueryChange(e.target.value)}
                            placeholder={t('org_search_placeholder')}
                            className="w-44 min-w-0 border-none bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
                        />
                        {query && (
                            <button type="button" onClick={() => onQueryChange('')} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {suggestions.length > 0 && (
                        <ul className="absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg">
                            {suggestions.map((p) => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        // onMouseDown (not onClick) so the pick fires before the input blur
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            onPick(p.id);
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent"
                                    >
                                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                                        <span className="truncate text-[12.5px] font-medium text-foreground">{p.label}</span>
                                        <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted-foreground">{p.code}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Layout direction */}
                <div className="inline-flex gap-0.5 rounded-lg bg-accent p-0.5">
                    {(['TB', 'LR'] as const).map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => onDirChange(d)}
                            className={cn(
                                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                                dir === d ? 'bg-card text-brand shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {d === 'TB' ? t('org_layout_vertical') : t('org_layout_horizontal')}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onToggleAll}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                >
                    {anyCollapsed ? t('org_expand_all') : t('org_collapse_all')}
                </button>
                <button
                    type="button"
                    onClick={onFit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
                >
                    <Maximize2 className="h-3.5 w-3.5" />
                    {t('org_fit')}
                </button>
            </div>
        </div>
    );
}
