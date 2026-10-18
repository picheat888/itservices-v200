// Report Center permission card: the master, one switch per report domain, then export and schedule.
import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { countGranted, type CountSpec } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { ChildList, ChildRow, PermissionCard, PermissionCell, SetHead, WIDE_CHILDREN } from './permission-layout';

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
export const REPORT_COUNT: CountSpec = { master: MASTER, gated: GROUPS.flatMap((g) => g.keys) };

const label = (key: string, lang: Lang) => actionLabel('reports', key.replace('reports.', ''), lang);
const info = (key: string, lang: Lang) => actionDescription('reports', key.replace('reports.', ''), lang);

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

    const activeCount = countGranted(REPORT_COUNT, has).on;

    return (
        <PermissionCard
            module="reports"
            on={activeCount}
            total={GATED_KEYS.length}
            lang={lang}
            keys={GATED_KEYS}
            master={{
                pkey: MASTER,
                label: label(MASTER, lang),
                on: masterOn,
                locked: isSuper,
                onToggle: () => toggle(MASTER),
                rest: GATED_KEYS.length - 1,
            }}
        >
            {masterOn &&
                GROUPS.map((group) => {
                    const wide = group.keys.length > WIDE_CHILDREN;
                    return (
                        <PermissionCell key={group.id} wide={wide}>
                            <SetHead label={translate(lang, group.labelKey)} />
                            <ChildList wide={wide}>
                                {group.keys.map((key) => (
                                    <ChildRow
                                        key={key}
                                        pkey={key}
                                        label={label(key, lang)}
                                        aria={`${translate(lang, group.labelKey)} ${label(key, lang)}`}
                                        info={info(key, lang)}
                                        on={has(key) && masterOn}
                                        locked={isSuper || !masterOn}
                                        lockedBy={label(MASTER, lang)}
                                        onToggle={() => toggle(key)}
                                    />
                                ))}
                            </ChildList>
                        </PermissionCell>
                    );
                })}
        </PermissionCard>
    );
}
