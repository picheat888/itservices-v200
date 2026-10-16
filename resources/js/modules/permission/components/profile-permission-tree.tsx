import { translate } from '@/lang';
import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

/**
 * The My Profile card: what a person may do with their own details and kit in the profile drawer.
 * Two independent switches, no master. Mirrors App\Support\Permissions::catalog()['profile'].
 */
const PROFILE_KEYS = ['profile.edit', 'profile.return_assets'];

const label = (key: string, lang: Lang) => {
    const [module, action] = key.split('.');
    return actionLabel(module, action, lang);
};
const info = (key: string, lang: Lang) => {
    const [module, action] = key.split('.');
    return actionDescription(module, action, lang);
};

/** A single toggle, matching the matrix switch (h-5 w-9). */
function Switch({ on, locked, onClick }: { on: boolean; locked: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            disabled={locked}
            onClick={onClick}
            className={cn(
                'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
                on ? 'bg-brand' : 'bg-muted',
                locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            )}
        >
            <span
                className={cn(
                    'bg-background flex h-4 w-4 items-center justify-center rounded-full shadow transition-transform',
                    on ? 'translate-x-[18px]' : 'translate-x-0.5',
                )}
            >
                {locked ? <Lock className="text-muted-foreground h-2.5 w-2.5" /> : on && <Check className="text-brand h-2.5 w-2.5" />}
            </span>
        </button>
    );
}

export function ProfilePermissionTree({
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

    const activeCount = PROFILE_KEYS.filter(has).length;

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="profile" on={activeCount} total={PROFILE_KEYS.length} lang={lang} />

            <div className="bg-brand/5 border-border border-b px-3.5 py-2">
                <div className="text-muted-foreground text-[10.5px]">{translate(lang, 'perm_ui_self_service_all')}</div>
            </div>

            <div className="px-3.5 py-1">
                {PROFILE_KEYS.map((key) => {
                    const description = info(key, lang);
                    return (
                        <div key={key} className="flex min-h-[34px] items-center gap-2">
                            <span className="flex items-center gap-1 text-sm font-medium">
                                {label(key, lang)}
                                {description && <InfoHint text={description} />}
                            </span>
                            <span className="ml-auto">
                                <Switch on={has(key)} locked={isSuper} onClick={() => toggle(key)} />
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
