import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { cascadeToggle, countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { WORKFLOW_COUNT, WORKFLOW_TREE } from '../lib/permission-specs';
import { ChildList, ChildRow, PermissionCard, PermissionCell, SetHead } from './permission-layout';

const { master: MASTER, group: GROUP } = WORKFLOW_TREE;
const GATED_KEYS = [MASTER, ...GROUP.keys];

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
        setDraft((prev) => cascadeToggle(prev, key, WORKFLOW_COUNT));
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
