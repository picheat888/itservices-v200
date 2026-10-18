// Colour field: a radio row of named palette swatches plus a "custom colour" swatch
// that opens the browser's native colour picker. Emits lowercase #rrggbb.
import { useT } from '@/lang';
import { DEFAULT_SWATCHES, findSwatch, normalizeHex, type Swatch } from '@/shared/lib/color-swatch';
import { cn } from '@/shared/lib/utils';
import { useId } from 'react';

export { DEFAULT_SWATCHES, type Swatch };

const SWATCH =
    'ring-offset-background block h-8 w-8 cursor-pointer rounded-full ring-2 ring-offset-2 transition-shadow peer-focus-visible:outline-brand peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4';
const RAINBOW = 'bg-[conic-gradient(#ef4444,#f59e0b,#22c55e,#06b6d4,#3b82f6,#a855f7,#ec4899,#ef4444)]';

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
    const customSelected = current !== null && !inPalette;

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

                {/* Custom colour */}
                {allowCustom && (
                    <label className="relative" title={t('color_custom')}>
                        <input
                            type="color"
                            value={current ?? palette[0]?.hex ?? '#000000'}
                            onChange={(e) => {
                                const hex = normalizeHex(e.target.value);
                                if (hex) onChange(hex);
                            }}
                            aria-label={t('color_custom')}
                            className="peer sr-only"
                        />
                        <span
                            aria-hidden
                            className={cn(SWATCH, customSelected ? 'ring-foreground' : cn(RAINBOW, 'hover:ring-border ring-transparent'))}
                            style={customSelected && current ? { background: current } : undefined}
                        />
                    </label>
                )}
            </div>
        </fieldset>
    );
}
