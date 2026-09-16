import { InfoHint } from '@/shared/components/info-hint';
import { cn } from '@/shared/lib/utils';
import type { Lang } from '@/shared/types';
import { Check, Lock } from 'lucide-react';
import { actionDescription, actionLabel } from '../lib/permission-labels';
import { PermissionCardHeader } from './permission-card-header';

/**
 * The rights an ordinary employee has over their own things — a card of its own.
 *
 * These two keys used to live at the bottom of the Assets card, under an Assets-module
 * master they deliberately ignore. That put a right every employee holds inside the card
 * for the IT function, where granting it looked like handing somebody the asset register.
 * They are one page (My assets & access) and now one card.
 *
 * Mirrors App\Support\Permissions::assetHierarchy()['standalone'] and
 * accessHierarchy()['standalone'] — keep in sync. `return` is a child of `my`: you cannot
 * send back kit you cannot see. The access half has no children.
 */
const ASSETS = { view: 'assets.my', children: ['assets.return'] };
const ACCESS = 'access.my';

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

export function SelfServicePermissionTree({
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

    /** Switching the asset view off takes its child with it — the server does the same. */
    const toggle = (key: string) => {
        if (isSuper) {
            return;
        }
        setDraft((prev) => {
            const next = new Set(prev);
            if (next.has(key)) {
                next.delete(key);
                if (key === ASSETS.view) {
                    ASSETS.children.forEach((child) => next.delete(child));
                }
            } else {
                next.add(key);
                // Turning on a child implies the view it hangs from — never a module master.
                if (ASSETS.children.includes(key)) {
                    next.add(ASSETS.view);
                }
            }
            return next;
        });
    };

    const assetsOn = has(ASSETS.view);
    const activeCount = [ASSETS.view, ACCESS].filter(has).length + ASSETS.children.filter((c) => has(c) && assetsOn).length;
    const totalCount = 2 + ASSETS.children.length;

    const row = (key: string, on: boolean, locked: boolean, child = false) => {
        const description = info(key, lang);
        return (
            <div key={key} className={cn('flex items-center gap-2', child ? 'min-h-[30px]' : 'min-h-[34px]')}>
                <span
                    className={cn(
                        'flex items-center gap-1',
                        child ? 'text-muted-foreground text-[12.5px]' : 'text-sm font-medium',
                    )}
                >
                    {label(key, lang)}
                    {description && <InfoHint text={description} />}
                </span>
                <span className="ml-auto">
                    <Switch on={on} locked={locked} onClick={() => toggle(key)} />
                </span>
            </div>
        );
    };

    return (
        <div className="border-border rounded-lg border">
            <PermissionCardHeader module="self_service" on={activeCount} total={totalCount} lang={lang} />

            <div className="bg-brand/5 border-border border-b px-3.5 py-2">
                <div className="text-muted-foreground text-[10.5px]">
                    {lang === 'th' ? 'บริการตนเอง · ไม่ขึ้นกับตัวหลัก' : 'Self-service · independent of every module master'}
                </div>
            </div>

            <div className="px-3.5 py-1">
                {row(ASSETS.view, assetsOn, isSuper)}
                <div className="border-border ml-2 space-y-0.5 border-l pl-3">
                    {ASSETS.children.map((child) => row(child, has(child) && assetsOn, isSuper || !assetsOn, true))}
                </div>
                {row(ACCESS, has(ACCESS), isSuper)}
            </div>
        </div>
    );
}
