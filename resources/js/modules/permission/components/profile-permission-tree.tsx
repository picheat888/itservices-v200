// My Profile permission card: independent switches (no master) for what a person may do in their own profile drawer.

import { translate } from '@/lang';
import type { Lang } from '@/shared/types';
import { countGranted } from '../lib/permission-count';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCard, PermissionCell, PlainRow, spreadRows } from './permission-layout';

const label = (key: string, lang: Lang) => {
    const [module, action] = key.split('.');
    return actionLabel(module, action, lang);
};
const info = (key: string, lang: Lang) => {
    const [module, action] = key.split('.');
    return actionDescription(module, action, lang);
};

export function ProfilePermissionTree({
    keys,
    draft,
    setDraft,
    isSuper,
    lang,
}: {
    keys: string[];
    draft: Set<string>;
    setDraft: React.Dispatch<React.SetStateAction<Set<string>>>;
    isSuper: boolean;
    lang: Lang;
}) {
    const has = (key: string) => isSuper || draft.has(key);

    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }
            return next;
        });
    };

    const activeCount = countGranted({ free: keys }, has).on;

    return (
        <PermissionCard
            module="profile"
            on={activeCount}
            total={keys.length}
            keys={keys}
            lang={lang}
            note={translate(lang, 'perm_ui_self_service_all')}
        >
            {spreadRows(keys).map((cell) => (
                <PermissionCell key={cell[0]}>
                    {cell.map((key) => (
                        <PlainRow
                            key={key}
                            pkey={key}
                            lang={lang}
                            label={label(key, lang)}
                            info={info(key, lang)}
                            on={has(key)}
                            locked={isSuper}
                            onToggle={() => toggle(key)}
                        />
                    ))}
                </PermissionCell>
            ))}
        </PermissionCard>
    );
}
