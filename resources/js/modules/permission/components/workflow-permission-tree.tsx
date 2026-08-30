import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

// Mirrors App\Support\Permissions::workflowHierarchy() — keep in sync.
const MASTER = 'workflows.module';
// One group, no children: opening the screen and rewriting a chain is the whole of it.
/**
 * The one thing the module lets you do, under a heading naming the thing it is done to.
 *
 * The heading carries no switch: there is no "may use the Workflows page" right beyond the
 * master above it. It is here so the card reads the same way as its neighbours — a master,
 * then a subject, then what you may do to it — rather than as a master with one loose row.
 */
const GROUP = { label: { en: 'Workflows', th: 'Workflow' }, keys: ['workflows.manage'] };
const GATED_KEYS = [MASTER, ...GROUP.keys];

const label = (key: string, lang: Lang) => actionLabel('workflows', key.replace('workflows.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('workflows', key.replace('workflows.', ''), lang);

/** A single toggle, matching the matrix switch (h-5 w-9). */
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

/**
 * Renders the Workflows permission card as a master → group tree (same shape as the
 * Contracts card): turning the master off clears + locks what is under it, turning a
 * child on implies the master. Super is read-only (everything shown on + locked).
 */
export function WorkflowPermissionTree({
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

    const activeCount = masterOn ? GATED_KEYS.filter(has).length : 0;
    const totalCount = GATED_KEYS.length;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="workflows" on={activeCount} total={totalCount} lang={lang} />

            <div className="bg-brand/5 border-border flex items-center gap-2.5 border-b px-3.5 py-2.5">
                <div className="min-w-0">
                    <div className="text-sm font-semibold">{label(MASTER, lang)}</div>
                    <div className="text-muted-foreground text-[10.5px]">
                        {lang === 'th' ? 'ตัวหลัก · คุมโมดูลและไอคอนใน sidebar' : 'Master · gates the module and the sidebar icon'}
                    </div>
                </div>
                <div className="ml-auto">
                    <Switch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="text-sm font-medium">{lang === 'th' ? GROUP.label.th : GROUP.label.en}</span>
                    </div>
                    <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                        {GROUP.keys.map((key) => {
                            const hint = info(key, lang);
                            return (
                                <div key={key} className="flex min-h-[30px] items-center gap-2">
                                    <span className="text-muted-foreground flex items-center gap-1 text-[12.5px]">
                                        {label(key, lang)}
                                        {hint && <InfoHint text={hint} />}
                                    </span>
                                    <span className="ml-auto">
                                        <Switch on={has(key) && masterOn} locked={isSuper || !masterOn} onClick={() => toggle(key)} />
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
