// Colour field: a radio row of named palette swatches plus a "custom colour" button that opens
// a popover with a contrast-safe colour grid, hex entry, a light/dark preview and Apply. Emits lowercase #rrggbb.
import { useT } from '@/lang';
import { contrastProblem, CUSTOM_COLOR_GRID, DEFAULT_SWATCHES, findSwatch, normalizeHex, type Swatch } from '@/shared/lib/color-swatch';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { Moon, Pencil, Plus, Sun } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

export { DEFAULT_SWATCHES, type Swatch };

const SWATCH =
    'ring-offset-background block h-8 w-8 cursor-pointer rounded-full ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4';

export function ColorSwatchPicker({
    value,
    onChange,
    label,
    showLabel = false,
    palette = DEFAULT_SWATCHES,
    allowCustom = true,
}: {
    value: string;
    onChange: (hex: string) => void;
    /** Legend of the group (the field's name). */
    label: string;
    /** Show the legend as the field label; otherwise it is read by screen readers only. */
    showLabel?: boolean;
    palette?: readonly Swatch[];
    allowCustom?: boolean;
}) {
    const t = useT();
    const name = useId();
    const current = normalizeHex(value);
    const inPalette = findSwatch(value, palette);

    return (
        <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={showLabel ? 'mb-2 text-sm leading-none font-medium' : 'sr-only'}>{label}</legend>
            <div className="flex flex-wrap items-center gap-2">
                {palette.map((swatch) => {
                    const selected = inPalette?.hex === swatch.hex;
                    return (
                        <label key={swatch.hex} className="relative" title={t(swatch.nameKey)}>
                            <input
                                type="radio"
                                name={name}
                                value={swatch.hex}
                                checked={selected}
                                onChange={() => onChange(normalizeHex(swatch.hex) ?? swatch.hex)}
                                aria-label={t(swatch.nameKey)}
                                className="peer sr-only"
                            />
                            <span
                                aria-hidden
                                className={cn(SWATCH, selected ? 'ring-foreground' : 'hover:ring-border ring-transparent')}
                                style={{ background: swatch.hex }}
                            />
                        </label>
                    );
                })}

                {allowCustom && <CustomColorButton value={current} selected={current !== null && !inPalette} onApply={onChange} />}
            </div>
        </fieldset>
    );
}

/** The "custom colour" circle and its popover; nothing changes until Apply. */
function CustomColorButton({ value, selected, onApply }: { value: string | null; selected: boolean; onApply: (hex: string) => void }) {
    const t = useT();
    const triggerRef = useRef<HTMLButtonElement>(null);
    const hexInputRef = useRef<HTMLInputElement>(null);
    const titleId = useId();
    const gridName = useId();
    const hexId = useId();
    const [open, setOpen] = useState(false);
    const [container, setContainer] = useState<HTMLElement | null>(null);
    // The hex without its "#", which the field shows as a fixed prefix
    const [draftText, setDraftText] = useState('');
    const [previewDark, setPreviewDark] = useState(false);

    const draftHex = normalizeHex(draftText);
    const showInvalid = draftText.trim() !== '' && draftHex === null;
    const problem = draftHex ? contrastProblem(draftHex) : null;
    const footerNote = showInvalid ? t('color_hex_invalid') : problem ? t(`color_${problem}`) : null;

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
            setDraftText((value ?? '').replace(/^#/, ''));
            setPreviewDark(false);
        }
        setOpen(next);
    };

    // Escape closes the popover only, not the dialog behind it
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            e.stopImmediatePropagation();
            setOpen(false);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [open]);

    const apply = () => {
        if (!draftHex || problem) return;
        onApply(draftHex);
        setOpen(false);
    };

    const Icon = selected ? Pencil : Plus;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-label={t('color_custom')}
                    aria-haspopup="dialog"
                    title={t('color_custom')}
                    className={cn(
                        'ring-offset-background flex h-8 w-8 items-center justify-center rounded-full ring-2 ring-offset-2 transition-shadow',
                        'focus-visible:outline-brand focus-visible:outline-2 focus-visible:outline-offset-4',
                        selected
                            ? 'ring-foreground text-white'
                            : 'border-muted-foreground text-muted-foreground hover:ring-border hover:text-foreground border-2 border-dashed ring-transparent',
                    )}
                    style={selected && value ? { background: value } : undefined}
                >
                    <Icon aria-hidden className={cn('h-4 w-4', selected && 'h-3.5 w-3.5 drop-shadow-[0_1px_1px_rgb(0_0_0/0.7)]')} />
                </button>
            </PopoverTrigger>
            <PopoverContent
                container={container}
                align="start"
                collisionPadding={16}
                aria-labelledby={titleId}
                className="w-96 space-y-3.5"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    hexInputRef.current?.focus();
                    hexInputRef.current?.select();
                }}
            >
                <h3 id={titleId} className="text-sm font-semibold">
                    {t('color_custom_title')}
                </h3>

                {/* Colour grid: every cell reads on both the light and the dark card */}
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="sr-only">{t('color_custom_title')}</legend>
                    <div className="grid grid-cols-12 gap-1.5">
                        {CUSTOM_COLOR_GRID.flat().map((hex) => (
                            <label key={hex} className="relative" title={hex}>
                                <input
                                    type="radio"
                                    name={gridName}
                                    value={hex}
                                    checked={draftHex === hex}
                                    onChange={() => setDraftText(hex.slice(1))}
                                    aria-label={hex}
                                    className="peer sr-only"
                                />
                                <span
                                    aria-hidden
                                    className={cn(
                                        'ring-offset-background peer-focus-visible:outline-brand block aspect-square w-full cursor-pointer rounded-md ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                                        draftHex === hex ? 'ring-foreground' : 'hover:ring-border ring-transparent',
                                    )}
                                    style={{ background: hex }}
                                />
                            </label>
                        ))}
                    </div>
                </fieldset>

                {/* Hex code and preview: two equal halves */}
                <div className="border-border grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-3.5">
                    <Label htmlFor={hexId} className="text-muted-foreground text-[13px]">
                        {t('color_hex_label')}
                    </Label>
                    <span className="text-muted-foreground text-[13px] leading-none font-medium">{t('color_preview')}</span>
                    <div className="relative">
                        <span aria-hidden className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                            #
                        </span>
                        <Input
                            id={hexId}
                            ref={hexInputRef}
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value.replace(/^#/, ''))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    apply();
                                }
                            }}
                            maxLength={6}
                            spellCheck={false}
                            autoComplete="off"
                            aria-invalid={showInvalid || problem !== null}
                            className={cn('pl-6 tracking-wide tabular-nums', (showInvalid || problem) && 'border-amber-600 dark:border-amber-500')}
                        />
                    </div>
                    {/* One ground at a time; the sun/moon button flips light and dark */}
                    <div
                        className={cn(
                            'flex h-10 items-center gap-2.5 rounded-md border pr-2.5 pl-1',
                            previewDark ? 'border-[#263041] bg-[#131720]' : 'border-[#e2e8f0] bg-[#ffffff]',
                        )}
                    >
                        <button
                            type="button"
                            onClick={() => setPreviewDark((dark) => !dark)}
                            aria-label={t(previewDark ? 'color_show_light' : 'color_show_dark')}
                            title={t(previewDark ? 'color_show_light' : 'color_show_dark')}
                            className={cn(
                                'focus-visible:outline-brand flex h-8 w-8 shrink-0 items-center justify-center rounded-md focus-visible:outline-2',
                                previewDark ? 'bg-[#1e2635] text-[#94a3b8]' : 'bg-[#f1f5f9] text-[#64748b]',
                            )}
                        >
                            {previewDark ? <Moon aria-hidden className="h-4 w-4" /> : <Sun aria-hidden className="h-4 w-4" />}
                        </button>
                        <span
                            role="img"
                            aria-label={t(previewDark ? 'color_show_dark' : 'color_show_light')}
                            className={cn('h-3.5 flex-1 rounded-full', !draftHex && 'bg-muted')}
                            style={draftHex ? { background: draftHex } : undefined}
                        />
                    </div>
                </div>

                {/* Footer: the reason a colour cannot be used, then the actions */}
                <div className="flex items-center gap-2 pt-1">
                    <p role="status" className="flex-1 text-[13px] text-amber-700 dark:text-amber-400">
                        {footerNote}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                        {t('cancel')}
                    </Button>
                    <Button type="button" size="sm" onClick={apply} disabled={!draftHex || problem !== null}>
                        {t('apply')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
