// Colour field: a radio row of named palette swatches plus a "custom colour" button that opens
// a popover with a contrast-safe colour grid, hex entry and Apply. Emits lowercase #rrggbb.
import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { CUSTOM_COLOR_GRID, DEFAULT_SWATCHES, findSwatch, meetsCardContrast, normalizeHex, type Swatch } from '@/shared/lib/color-swatch';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { AlertTriangle, Pencil, Plus } from 'lucide-react';
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
    const [open, setOpen] = useState(false);
    const [container, setContainer] = useState<HTMLElement | null>(null);
    const [draftText, setDraftText] = useState('');

    const draftHex = normalizeHex(draftText);
    const showInvalid = draftText.trim() !== '' && draftHex === null;
    const lowContrast = draftHex !== null && !meetsCardContrast(draftHex);

    const handleOpenChange = (next: boolean) => {
        if (next) {
            setContainer((triggerRef.current?.closest('[role="dialog"]') as HTMLElement | null) ?? null);
            setDraftText(value ?? '');
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
        if (!draftHex) return;
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
                className="w-80 space-y-3"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    hexInputRef.current?.focus();
                    hexInputRef.current?.select();
                }}
            >
                <h3 id={titleId} className="text-sm font-semibold">
                    {t('color_custom_title')}
                </h3>

                {/* Colour grid */}
                <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="sr-only">{t('color_custom_title')}</legend>
                    <div className="grid grid-cols-10 gap-1.5">
                        {CUSTOM_COLOR_GRID.flat().map((hex, i) =>
                            hex ? (
                                <label key={hex} className="relative" title={hex}>
                                    <input
                                        type="radio"
                                        name={gridName}
                                        value={hex}
                                        checked={draftHex === hex}
                                        onChange={() => setDraftText(hex)}
                                        aria-label={hex}
                                        className="peer sr-only"
                                    />
                                    <span
                                        aria-hidden
                                        className={cn(
                                            'ring-offset-background peer-focus-visible:outline-brand block h-6 w-6 cursor-pointer rounded-md ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4',
                                            draftHex === hex ? 'ring-foreground' : 'hover:ring-border ring-transparent',
                                        )}
                                        style={{ background: hex }}
                                    />
                                </label>
                            ) : (
                                <span key={`empty-${i}`} aria-hidden className="h-6 w-6" />
                            ),
                        )}
                    </div>
                </fieldset>

                {/* Hex entry + preview */}
                <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                        <Field label={t('color_hex_label')} error={showInvalid ? t('color_hex_invalid') : undefined}>
                            <Input
                                ref={hexInputRef}
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        apply();
                                    }
                                }}
                                maxLength={7}
                                spellCheck={false}
                                autoComplete="off"
                                className="tabular-nums"
                            />
                        </Field>
                    </div>
                    <div className="shrink-0 space-y-1.5">
                        <div className="text-sm leading-none font-medium">{t('color_preview')}</div>
                        <span
                            aria-hidden
                            className={cn('border-border block h-10 w-10 rounded-md border', !draftHex && 'bg-muted')}
                            style={draftHex ? { background: draftHex } : undefined}
                        />
                    </div>
                </div>

                {lowContrast && (
                    <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('color_contrast_warning')}
                    </p>
                )}

                {/* Footer actions */}
                <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                        {t('cancel')}
                    </Button>
                    <Button type="button" size="sm" onClick={apply} disabled={!draftHex}>
                        {t('apply')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
