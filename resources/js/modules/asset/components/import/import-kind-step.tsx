// Step 1 of the asset import dialog: buy or rent, as two real radios in a fieldset.
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { FileText, ShoppingBag, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ImportKind } from '../../api/assetImportApi';

const CARDS: { kind: ImportKind; icon: LucideIcon; titleKey: string; subKey: string }[] = [
    { kind: 'purchased', icon: ShoppingBag, titleKey: 'asset_import_card_purchased', subKey: 'asset_source_purchased_sub' },
    { kind: 'rented', icon: FileText, titleKey: 'asset_import_card_rented', subKey: 'asset_source_rented_sub' },
];

export function ImportKindStep({ kind, onChange }: { kind: ImportKind | null; onChange: (kind: ImportKind) => void }) {
    const t = useT();
    const group = useRef<HTMLFieldSetElement>(null);

    // Focus lands on the chosen radio when the step opens
    useEffect(() => {
        group.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
    }, []);

    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
            <div>
                <h3 tabIndex={-1} className="text-lg font-bold tracking-tight text-balance">
                    {t('asset_import_kind_heading')}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-sm">{t('asset_import_kind_sub')}</p>
            </div>

            {/* Only-new notice */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-200">
                <TriangleAlert className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="font-semibold">{t('asset_import_only_new')}</div>
            </div>

            <fieldset ref={group} className="grid gap-3 sm:grid-cols-2">
                <legend className="sr-only">{t('asset_import_step_kind')}</legend>
                {CARDS.map(({ kind: value, icon: Icon, titleKey, subKey }) => (
                    <label
                        key={value}
                        className="border-border hover:border-brand/50 has-[:checked]:border-brand has-[:focus-visible]:ring-ring group relative flex min-h-16 cursor-pointer gap-4 rounded-lg border p-4 transition-colors has-[:focus-visible]:ring-2"
                    >
                        <input
                            type="radio"
                            name="asset-import-kind"
                            value={value}
                            checked={kind === value}
                            onChange={() => onChange(value)}
                            className="sr-only"
                        />
                        <span className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                            <Icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{t(titleKey)}</span>
                            <span className="text-muted-foreground mt-0.5 block text-sm leading-relaxed">{t(subKey)}</span>
                        </span>
                        {/* Ring, filled when chosen */}
                        <span
                            aria-hidden="true"
                            className="border-input group-has-[:checked]:border-brand mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2"
                        >
                            <span
                                className={cn(
                                    'bg-brand h-2.5 w-2.5 scale-0 rounded-full transition-transform motion-reduce:transition-none',
                                    'group-has-[:checked]:scale-100',
                                )}
                            />
                        </span>
                    </label>
                ))}
            </fieldset>
        </div>
    );
}
