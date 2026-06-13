import { useConfirm } from '@/components/ui/confirm-dialog';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { Box, ShieldCheck } from 'lucide-react';

/**
 * SerialToggle — a clickable card row that switches a SKU (or category default)
 * between "keep all serial numbers" and "tracked by quantity only".
 *
 * When `confirmOnEnable` is set, turning the switch ON asks for confirmation
 * first, since it forces a serial to be captured for every unit at receiving.
 */
export function SerialToggle({
    value,
    onChange,
    confirmOnEnable = false,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    confirmOnEnable?: boolean;
}) {
    const t = useT();
    const confirm = useConfirm();

    const handleToggle = async () => {
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
            className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                value ? 'border-brand/50 bg-brand/5' : 'border-border hover:bg-accent/40',
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
            </span>
            <span className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', value ? 'bg-brand' : 'bg-muted-foreground/30')}>
                <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', value ? 'left-[18px]' : 'left-0.5')} />
            </span>
        </button>
    );
}
