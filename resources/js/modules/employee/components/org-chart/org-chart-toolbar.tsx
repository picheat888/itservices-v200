import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { localPair } from '@/shared/lib/local-name';
import { matchesAllWords, searchLabel } from '@/shared/lib/search-words';
import { cn } from '@/shared/lib/utils';
import { useUiStore } from '@/stores/ui';
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
    /** Lowercased haystack across both languages, code, title and department. */
    search: string;
}

/** Org chart toolbar: visible count, search with jump-to suggestions, layout direction, collapse/expand all and fit. */
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
    const fmtN = useNumberFormat();
    const lang = useUiStore((s) => s.lang);
    // Keyboard-highlighted suggestion
    const [activeIndex, setActiveIndex] = useState(0);

    const q = query.trim().toLowerCase();
    const suggestions = useMemo(() => {
        if (!q) {
            return [];
        }
        return people.filter((p) => matchesAllWords(p.search, q)).slice(0, 6);
    }, [q, people]);
    const active = suggestions.length ? Math.min(activeIndex, suggestions.length - 1) : 0;

    const stat = (num: number, label: string) => (
        <div className="flex flex-col items-center justify-center px-4">
            <span className="text-foreground text-lg leading-none font-extrabold tracking-tight">{fmtN(num)}</span>
            <span className="text-muted-foreground mt-0.5 text-[11px]">{label}</span>
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
                            name="search"
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
                            aria-label={searchLabel(t('org_search_placeholder'))}
                            className="text-foreground placeholder:text-muted-foreground w-56 min-w-0 border-none bg-transparent text-[12.5px] text-ellipsis outline-none"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => onQueryChange('')}
                                aria-label={t('clear')}
                                title={t('clear')}
                                className="text-muted-foreground hover:text-foreground focus-visible:ring-brand rounded focus-visible:ring-2 focus-visible:outline-none"
                            >
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
                                        // onMouseDown so the pick fires before the input blur
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
                                            <div className="text-foreground truncate text-[12.5px] font-medium">
                                                {localPair(p.nameEn, p.nameTh, lang)}
                                            </div>
                                            {p.nameTh && (
                                                <div className="text-muted-foreground truncate text-[11px]">
                                                    {lang === 'th' ? p.nameEn : p.nameTh}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-muted-foreground shrink-0 self-center text-[11px]">{p.code}</span>
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
                            aria-pressed={dir === d}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                                dir === d ? 'bg-brand text-brand-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
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
