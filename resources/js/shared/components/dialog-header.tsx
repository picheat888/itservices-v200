import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { type LucideIcon } from 'lucide-react';

/**
 * Shared header for the app's centered focus dialogs (contract View/Edit, access
 * Manage, …): a type-icon tile, an uppercase eyebrow, the title with an optional
 * mono code chip and title-suffix slot, an optional sub-line, an optional
 * right-edge slot, and an sr-only description.
 *
 * The tile + code chip use the brand accent by default; pass `accent` (a hex) to
 * tint them with a resource-type colour instead (e.g. email-group violet).
 */
export function FocusDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
    subtitle,
    titleSuffix,
    headerRight,
    accent,
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    code?: string;
    srDescription?: string;
    /** A line under the title row (e.g. an email / path / meta chips). */
    subtitle?: React.ReactNode;
    /** Rendered inside the title row, right after the code chip (e.g. days-remaining badge). */
    titleSuffix?: React.ReactNode;
    /** Rendered at the header's right edge, left of the dialog's ✕ close button (e.g. status badge). */
    headerRight?: React.ReactNode;
    /** Optional hex accent for the tile + code chip; defaults to the brand colour. */
    accent?: string;
}) {
    const tintStyle = accent ? { background: `${accent}18`, color: accent } : undefined;
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <div
                className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', !accent && 'bg-brand/10 text-brand')}
                style={tintStyle}
            >
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">{eyebrow}</div>
                <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span
                            className={cn('shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold', !accent && 'bg-brand/10 text-brand')}
                            style={tintStyle}
                        >
                            {code}
                        </span>
                    )}
                    {titleSuffix}
                </DialogTitle>
                {subtitle && <div className="mt-1 flex flex-wrap items-center gap-2">{subtitle}</div>}
            </div>
            {headerRight && <div className="ml-auto flex shrink-0 items-center gap-2 pr-8">{headerRight}</div>}
            <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        </div>
    );
}
