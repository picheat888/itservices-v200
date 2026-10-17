import { translate } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';
import { PermissionSwitch } from './permission-switch';

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
const GROUP = { labelKey: 'perm_ui_group_workflows', keys: ['workflows.manage'] };
const GATED_KEYS = [MASTER, ...GROUP.keys];

const label = (key: string, lang: Lang) => actionLabel('workflows', key.replace('workflows.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('workflows', key.replace('workflows.', ''), lang);

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
                    <div className="text-muted-foreground text-[10.5px]">{translate(lang, 'perm_ui_master_note')}</div>
                </div>
                <div className="ml-auto">
                    <PermissionSwitch on={masterOn} locked={isSuper} onClick={() => toggle(MASTER)} />
                </div>
            </div>

            <div className={cn('px-3.5 py-1 transition-opacity', !masterOn && 'opacity-40')}>
                <div className="py-0.5">
                    <div className="flex min-h-[34px] items-center gap-2">
                        <span className="text-sm font-medium">{translate(lang, GROUP.labelKey)}</span>
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
                                        <PermissionSwitch on={has(key) && masterOn} locked={isSuper || !masterOn} onClick={() => toggle(key)} />
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
