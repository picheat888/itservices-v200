import { DARK_GROUND, LIGHT_GROUND, readableInk } from '@/shared/lib/contrast';
import { cn } from '@/shared/lib/utils';
import { DialogDescription, DialogTitle } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { type LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';

/**
 * Shared header for the app's centered focus dialogs (contract View/Edit, access
 * Manage, …): a type-icon tile, an uppercase eyebrow, the title with an optional
 * code chip and title-suffix slot, an optional sub-line, an optional
 * right-edge slot, and an sr-only description.
 *
 * The eyebrow is tracked-out capitals in English only: Thai has no case, and letter-spacing
 * pulls its vowels and tone marks away from their consonants, so in Thai it is plain small text.
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
    image,
    round,
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
    /** Optional hex accent for the tile + code chip; defaults to the brand colour. */
    accent?: string;
    /** Optional logo URL — when set, a round profile-style image replaces the icon tile. */
    image?: string | null;
    /** Render the icon tile as a circle (profile style) instead of a rounded square. */
    round?: boolean;
    /** Icon-tile size: `md` (default, 40px) or `lg` (56px). */
    tileSize?: 'md' | 'lg';
}) {
    const lang = useUiStore((s) => s.lang);
    // Icon tile: the accent kept at 3:1 on its tint in both themes
    const tintStyle = accent
        ? ({
              background: `${accent}18`,
              '--ink': readableInk(accent, LIGHT_GROUND, 0x18 / 255, 3),
              '--ink-dark': readableInk(accent, DARK_GROUND, 0x18 / 255, 3),
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
    const iconCls = tileSize === 'lg' ? 'h-7 w-7' : 'h-5 w-5';
    return (
        <div className="flex items-center gap-3 px-6 pt-5 pb-4">
            {image ? (
                <img src={image} alt="" className={cn('shrink-0 rounded-full object-cover', boxCls)} />
            ) : (
                <div
                    className={cn(
                        'flex shrink-0 items-center justify-center',
                        boxCls,
                        round ? 'rounded-full' : 'rounded-xl',
                        accent ? 'text-[var(--ink)] dark:text-[var(--ink-dark)]' : 'bg-brand/10 text-brand',
                    )}
                    style={tintStyle}
                >
                    <Icon className={iconCls} />
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
                                'shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold',
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
