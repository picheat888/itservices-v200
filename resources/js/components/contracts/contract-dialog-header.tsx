import { DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type LucideIcon } from 'lucide-react';

/**
 * Shared header for the contract View and Edit dialogs: a brand-tinted type-icon
 * tile, an uppercase eyebrow, the title with an optional mono code chip and an
 * optional title-suffix slot (e.g. a days-remaining badge), an optional right-edge
 * slot (e.g. a status badge), and an sr-only description for accessibility.
 */
export function ContractDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
    titleSuffix,
    headerRight,
}: {
    icon: LucideIcon;
    eyebrow: string;
    title: string;
    code?: string;
    srDescription?: string;
    /** Rendered inside the title row, right after the code chip (e.g. days-remaining badge). */
    titleSuffix?: React.ReactNode;
    /** Rendered at the header's right edge, left of the dialog's ✕ close button (e.g. status badge). */
    headerRight?: React.ReactNode;
}) {
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            <div className="bg-brand/10 text-brand flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <div className="text-muted-foreground text-[10.5px] font-bold tracking-[0.14em] uppercase">{eyebrow}</div>
                <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span className="bg-brand/10 text-brand shrink-0 rounded-md px-2 py-0.5 font-mono text-xs font-semibold">{code}</span>
                    )}
                    {titleSuffix}
                </DialogTitle>
            </div>
            {headerRight && <div className="ml-auto flex shrink-0 items-center gap-2 pr-8">{headerRight}</div>}
            <DialogDescription className="sr-only">{srDescription ?? title}</DialogDescription>
        </div>
    );
}
