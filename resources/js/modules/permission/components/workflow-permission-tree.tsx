import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { countGranted, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, PermissionCard, PermissionCell, SetHead } from './permission-layout';

// Mirrors App\Support\Permissions::workflowHierarchy() — keep in sync.
const MASTER = 'workflows.module';
// The one right, under a heading naming the thing it is done to (no switch on the heading).
const GROUP = { labelKey: 'perm_ui_group_workflows', keys: ['workflows.manage'] };
const GATED_KEYS = [MASTER, ...GROUP.keys];
export const WORKFLOW_COUNT: CountSpec = { master: MASTER, gated: GROUP.keys };

const label = (key: string, lang: Lang) => actionLabel('workflows', key.replace('workflows.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('workflows', key.replace('workflows.', ''), lang);

/** Workflows permission card: turning the master off clears what is under it; a child on implies the master. */
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

    const activeCount = countGranted(WORKFLOW_COUNT, has).on;
    const totalCount = GATED_KEYS.length;

    return (
        <PermissionCard
            module="workflows"
            on={activeCount}
            total={totalCount}
            lang={lang}
            keys={GATED_KEYS}
            master={{ pkey: MASTER, label: label(MASTER, lang), on: masterOn, locked: isSuper, onToggle: () => toggle(MASTER), rest: totalCount - 1 }}
        >
            {masterOn && (
                <PermissionCell>
                    <SetHead label={translate(lang, GROUP.labelKey)} />
                    <ChildList>
                        {GROUP.keys.map((key) => (
                            <ChildRow
                                key={key}
                                pkey={key}
                                label={label(key, lang)}
                                aria={`${translate(lang, GROUP.labelKey)} ${label(key, lang)}`}
                                info={info(key, lang)}
                                on={has(key) && masterOn}
                                locked={isSuper || !masterOn}
                                lockedBy={label(MASTER, lang)}
                                onToggle={() => toggle(key)}
                            />
                        ))}
                    </ChildList>
                </PermissionCell>
            )}
        </PermissionCard>
    );
}
