import { DARK_GROUND, LIGHT_GROUND, readableInk } from '@/shared/lib/contrast';
import { cn } from '@/shared/lib/utils';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

export type HeaderTone = 'brand' | 'danger' | 'warn' | 'success';

// Icon colour by meaning: routine work, cannot be undone, take care, done
const TONE: Record<HeaderTone, string> = {
    brand: 'text-brand',
    danger: 'text-destructive',
    warn: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
};

/** Shared header for the centred focus dialogs: a bare line icon coloured by meaning, an eyebrow (spaced capitals in English only), the title with an optional code chip, sub-line and right-edge slot. */
export function FocusDialogHeader({
    icon: Icon,
    eyebrow,
    title,
    code,
    srDescription,
    subtitle,
    titleSuffix,
    headerRight,
    tone = 'brand',
    accent,
    image,
    tileSize = 'md',
}: {
    icon: LucideIcon;
    /** Small uppercase line above the title — a string, or a node for richer content (e.g. label + doc no.). */
    eyebrow: React.ReactNode;
    title: string;
    code?: string;
    srDescription?: string;
    /** A line under the title row (e.g. an email / path / meta chips). */
    subtitle?: React.ReactNode;
    /** Rendered inside the title row, right after the code chip (e.g. days-remaining badge). */
    titleSuffix?: React.ReactNode;
    /** Rendered at the header's right edge, left of the dialog's ✕ close button (e.g. status badge). */
    headerRight?: React.ReactNode;
    /** Icon colour by meaning; `accent` overrides it with a category colour. */
    tone?: HeaderTone;
    /** Optional hex category colour for the icon + code chip (e.g. email-group violet). */
    accent?: string;
    /** Optional logo URL; a round image replaces the icon. */
    image?: string | null;
    /** Icon slot: `md` (default, 40px, 32px icon) or `lg` (56px, 44px icon). */
    tileSize?: 'md' | 'lg';
}) {
    const lang = useUiStore((s) => s.lang);
    // Bare icon: the accent kept at 3:1 on the dialog background in both themes
    const iconStyle = accent
        ? ({
              '--ink': readableInk(accent, LIGHT_GROUND, 0, 3),
              '--ink-dark': readableInk(accent, DARK_GROUND, 0, 3),
          } as CSSProperties)
        : undefined;
    // Code chip text: the accent darkened/lightened only as far as 4.5:1 on its tint needs.
    const codeStyle = accent
        ? ({
              background: `${accent}18`,
              '--ink': readableInk(accent, LIGHT_GROUND, 0x18 / 255),
              '--ink-dark': readableInk(accent, DARK_GROUND, 0x18 / 255),
          } as CSSProperties)
        : undefined;
    const boxCls = tileSize === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
    const iconCls = tileSize === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            {image ? (
                <img src={image} alt="" className={cn('shrink-0 rounded-full object-cover', boxCls)} />
            ) : (
                <div
                    className={cn(
                        'flex shrink-0 items-center justify-center',
                        boxCls,
                        accent ? 'text-[var(--ink)] dark:text-[var(--ink-dark)]' : TONE[tone],
                    )}
                    style={iconStyle}
                    aria-hidden
                >
                    <Icon className={iconCls} strokeWidth={1.75} />
                </div>
            )}
            <div className="min-w-0">
                <div
                    className={cn(
                        'text-muted-foreground',
                        lang === 'th' ? 'text-xs font-semibold' : 'text-[10.5px] font-bold tracking-[0.14em] uppercase',
                    )}
                >
                    {eyebrow}
                </div>
                <DialogTitle className="mt-0.5 flex flex-wrap items-center gap-2 text-base font-extrabold tracking-tight">
                    <span className="truncate">{title}</span>
                    {code && (
                        <span
                            className={cn(
                                'max-w-full shrink-0 truncate rounded-md px-2 py-0.5 text-xs font-semibold',
                                accent ? 'text-[var(--ink)] dark:text-[var(--ink-dark)]' : 'bg-brand/10 text-brand-ink',
                            )}
                            style={codeStyle}
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
