// Report Center permission card: the master, one switch per report domain, then export and schedule.
import { translate } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::reportHierarchy()
const MASTER = 'reports.module';

const GROUPS: { id: string; labelKey: string; keys: string[] }[] = [
    {
        id: 'domains',
        labelKey: 'perm_ui_group_report_domains',
        keys: ['reports.tickets', 'reports.assets', 'reports.contracts', 'reports.stock', 'reports.requests', 'reports.employees', 'reports.access'],
    },
    { id: 'tools', labelKey: 'perm_ui_group_report_tools', keys: ['reports.export', 'reports.schedule'] },
];

const GATED_KEYS = [MASTER, ...GROUPS.flatMap((g) => g.keys)];

const label = (key: string, lang: Lang) => actionLabel('reports', key.replace('reports.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('reports', key.replace('reports.', ''), lang);

function Switch({ on, locked, onClick }: { on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={locked}
            onClick={onClick}
            className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50', on ? 'bg-brand' : 'bg-muted')}
        >
            <span
                className={cn(
                    'absolute top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white transition-all',
                    on ? 'left-[1.125rem]' : 'left-0.5',
                )}
            >
                {on && <Check className="text-brand h-2.5 w-2.5" />}
                {locked && !on && <Lock className="text-muted-foreground h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

function ChildRow({ keyName, on, locked, lang, onToggle }: { keyName: string; on: boolean; locked: boolean; lang: Lang; onToggle: () => void }) {
    const hint = info(keyName, lang);

    return (
        <div className="flex min-h-[30px] items-center gap-2">
            <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                {label(keyName, lang)}
                {hint && <InfoHint text={hint} />}
            </span>
            <span className="ml-auto">
                <Switch on={on} locked={locked} onClick={onToggle} />
            </span>
        </div>
    );
}

export function ReportPermissionTree({
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);
    const masterOn = has(MASTER);

    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === MASTER) {
                    GATED_KEYS.forEach((k) => next.delete(k));
                }
            } else {
                next.add(key);
                next.add(MASTER);
            }

            return next;
        });
    };

    const activeCount = masterOn ? GATED_KEYS.filter((k) => has(k)).length : 0;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="reports" on={activeCount} total={GATED_KEYS.length} lang={lang} />

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{label(MASTER, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">{translate(lang, 'perm_ui_master_note')}</div>
                </div>
                <div className="ml-auto">
                    <Switch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                {GROUPS.map((group) => (
                    <div key={group.id} className="py-0.5">
                        <div className="flex min-h-[34px] items-center gap-2">
                            <span className="text-sm font-medium">{translate(lang, group.labelKey)}</span>
                        </div>
                        <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                            {group.keys.map((key) => (
                                <ChildRow
                                    key={key}
                                    keyName={key}
                                    on={has(key) && masterOn}
                                    locked={isSuper || !masterOn}
                                    lang={lang}
                                    onToggle={() => toggle(key)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
