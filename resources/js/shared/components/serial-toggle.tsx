import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Box, Lock, ShieldCheck } from 'lucide-react';

/**
 * SerialToggle — a clickable card row that switches a SKU (or category default)
 * between "keep all serial numbers" and "tracked by quantity only".
 *
 * When `confirmOnEnable` is set, turning the switch ON asks for confirmation
 * first, since it forces a serial to be captured for every unit at receiving.
 * A `lockedReason` shows the switch as fixed, with that reason under it.
 */
export function SerialToggle({
    value,
    onChange,
    confirmOnEnable = false,
    lockedReason,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    confirmOnEnable?: boolean;
    lockedReason?: string;
}) {
    const t = useT();
    const confirm = useConfirm();

    const handleToggle = async () => {
        if (lockedReason) return;
        const next = !value;
        if (next && confirmOnEnable) {
            if (
                !(await confirm({
                    variant: 'warn',
                    title: t('stock_track_serial_title'),
                    description: t('stock_keep_serials_confirm'),
                    confirmText: t('stock_enable'),
                }))
            ) {
                return;
            }
        }
        onChange(next);
    };

    return (
        <button
            type="button"
            onClick={handleToggle}
            aria-pressed={value}
            aria-disabled={lockedReason ? true : undefined}
            className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                lockedReason ? 'border-border bg-muted/30 cursor-default' : value ? 'border-brand/50 bg-brand/5' : 'border-border hover:bg-accent/40',
            )}
        >
            <span
                className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                    value ? 'bg-brand/10 text-brand' : 'bg-muted text-muted-foreground',
                )}
            >
                {value ? <ShieldCheck className="h-[18px] w-[18px]" /> : <Box className="h-[18px] w-[18px]" />}
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t('stock_track_serial_title')}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">{value ? t('stock_track_serial_on') : t('stock_track_serial_off')}</span>
                {lockedReason && (
                    <span className="mt-1.5 flex gap-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {lockedReason}
                    </span>
                )}
            </span>
            <span
                className={cn(
                    'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                    value ? 'bg-brand' : 'bg-muted-foreground/80 dark:bg-muted-foreground/60',
                    lockedReason && 'opacity-45',
                )}
            >
                <span
                    className={cn(
                        'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform motion-reduce:transition-none',
                        value ? 'translate-x-[18px]' : 'translate-x-0.5',
                    )}
                />
            </span>
        </button>
    );
}
