import { SearchableSelect } from '@/components/shared/searchable-select';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { useUiStore } from '@/stores/ui';
import type { OrgChartNode } from '@/types';
import { FoldVertical, UnfoldVertical } from 'lucide-react';
import { useMemo } from 'react';

/**
 * Org chart toolbar: search a person to jump+center on them, and a single
 * collapse-all / expand-all toggle. Zoom and fit live in React Flow's Controls.
 */
export function OrgChartToolbar({
    nodes,
    allCollapsed,
    onJump,
    onToggleAll,
}: {
    nodes: OrgChartNode[];
    allCollapsed: boolean;
    onJump: (id: number) => void;
    onToggleAll: () => void;
}) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);

    const options = useMemo(
        () =>
            nodes.map((n) => ({
                value: String(n.id),
                label: lang === 'th' ? (n.name_th ?? n.name) : n.name,
                hint: n.title ?? undefined,
                sub: n.code,
                avatar: n.photo_url,
                search: `${n.name} ${n.name_th ?? ''} ${n.code} ${n.title ?? ''}`,
            })),
        [nodes, lang],
    );

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
            <div className="w-64 max-w-full">
                <SearchableSelect
                    value=""
                    onChange={(v) => v && onJump(Number(v))}
                    options={options}
                    placeholder={t('org_search_placeholder')}
                />
            </div>
            <Button variant="outline" onClick={onToggleAll}>
                {allCollapsed ? <UnfoldVertical className="h-4 w-4" /> : <FoldVertical className="h-4 w-4" />}
                {allCollapsed ? t('org_expand_all') : t('org_collapse_all')}
            </Button>
        </div>
    );
}
