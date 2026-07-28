import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { ArrowDown, ArrowRight, ChevronsDownUp, ChevronsUpDown, Maximize2, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { OrgDir } from '../../lib/org-tree';

interface OrgStats {
    total: number;
    levels: number;
    managers: number;
}

/** Lightweight person record for the search suggestion list. */
export interface OrgPerson {
    id: number;
    nameEn: string;
    nameTh: string | null;
    code: string;
    color: string;
    /** Lowercased haystack across both languages + code/title/dept (UI-language independent). */
    search: string;
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
    // Which suggestion the keyboard has highlighted (clamped to the list length on render).
    const [activeIndex, setActiveIndex] = useState(0);

    const q = query.trim().toLowerCase();
    const suggestions = useMemo(() => {
        if (!q) {
            return [];
        }
        return people.filter((p) => p.search.includes(q)).slice(0, 6);
    }, [q, people]);
    const active = suggestions.length ? Math.min(activeIndex, suggestions.length - 1) : 0;

    const stat = (num: number, label: string) => (
        <div className="flex flex-col items-center justify-center px-4">
            <span className="text-foreground font-mono text-lg leading-none font-extrabold tracking-tight">{num}</span>
            <span className="text-muted-foreground mt-0.5 text-[9.5px] tracking-wider uppercase">{label}</span>
        </div>
    );

    return (
        <div className="border-border flex flex-wrap items-center gap-3 border-b p-3">
            {/* Stats */}
            <div className="flex items-stretch">{stat(stats.total, t('org_total'))}</div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* Search with suggestion dropdown */}
                <div className="relative">
                    <div className="border-border bg-card hover:border-brand/50 focus-within:border-brand focus-within:ring-brand/15 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors focus-within:ring-[3px]">
                        <Search className="text-muted-foreground h-3.5 w-3.5" />
                        <input
                            value={query}
                            onChange={(e) => {
                                onQueryChange(e.target.value);
                                setActiveIndex(0);
                            }}
                            onKeyDown={(e) => {
                                if (suggestions.length === 0) {
                                    if (e.key === 'Escape') {
                                        onQueryChange('');
                                    }
                                    return;
                                }
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    setActiveIndex((i) => Math.max(i - 1, 0));
                                } else if (e.key === 'Enter') {
                                    e.preventDefault();
                                    onPick(suggestions[active].id);
                                } else if (e.key === 'Escape') {
                                    onQueryChange('');
                                }
                            }}
                            placeholder={t('org_search_placeholder')}
                            className="text-foreground placeholder:text-muted-foreground w-44 min-w-0 border-none bg-transparent text-[12.5px] outline-none"
                        />
                        {query && (
                            <button type="button" onClick={() => onQueryChange('')} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {suggestions.length > 0 && (
                        <ul className="border-border bg-card absolute top-full left-0 z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border py-1 shadow-lg">
                            {suggestions.map((p, i) => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        // onMouseDown (not onClick) so the pick fires before the input blur
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            onPick(p.id);
                                        }}
                                        onMouseEnter={() => setActiveIndex(i)}
                                        className={cn(
                                            'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                                            i === active ? 'bg-accent' : 'hover:bg-accent',
                                        )}
                                    >
                                        <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="text-foreground truncate text-[12.5px] font-medium">{p.nameEn}</div>
                                            {p.nameTh && <div className="text-muted-foreground truncate text-[11px]">{p.nameTh}</div>}
                                        </div>
                                        <span className="text-muted-foreground shrink-0 self-center font-mono text-[10.5px]">{p.code}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Layout direction */}
                <div className="bg-accent inline-flex gap-0.5 rounded-lg p-0.5">
                    {(['TB', 'LR'] as const).map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => onDirChange(d)}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                                dir === d ? 'bg-brand text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {d === 'TB' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
                            {d === 'TB' ? t('org_layout_vertical') : t('org_layout_horizontal')}
                        </button>
                    ))}
                </div>

                <button
                    type="button"
                    onClick={onToggleAll}
                    className="border-border bg-card text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                >
                    {anyCollapsed ? <ChevronsUpDown className="h-3.5 w-3.5" /> : <ChevronsDownUp className="h-3.5 w-3.5" />}
                    {anyCollapsed ? t('org_expand_all') : t('org_collapse_all')}
                </button>
                <button
                    type="button"
                    onClick={onFit}
                    className="border-border bg-card text-foreground hover:bg-accent inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                >
                    <Maximize2 className="h-3.5 w-3.5" />
                    {t('org_fit')}
                </button>
            </div>
        </div>
    );
}
