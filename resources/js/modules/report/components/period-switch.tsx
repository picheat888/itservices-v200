/**
 * The Report Center's period control beside the heading: 7 วัน / 30 วัน / 90 วัน / กำหนดเอง.
 * The presets switch at once; "กำหนดเอง" opens a small panel with two date fields and applies
 * only on "ใช้ช่วงนี้", then the button itself shows the chosen dates ("1 ก.ย. – 2 ต.ค. 2026").
 * The panel checks what the API checks (end not before start, nothing past today) so the
 * button stays off until the range is one the server takes. State: hooks/use-snapshot-range.ts.
 *
 * On the light page ground a muted track vanished, so in light it is a bordered card with the
 * chosen period in brand (as the Ticket page's range switch); dark keeps its muted track.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { DateInput } from '@/shared/ui/date-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { useUiStore } from '@/stores/ui';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { SNAPSHOT_PRESETS } from '../hooks/use-snapshot-range';
import type { SnapshotRange } from '../types';
import { compactRange, isoDate, periodRange } from './report-scope';

const SEGMENT =
    'focus-visible:ring-brand/30 inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none';
const SEGMENT_ON = 'bg-brand text-brand-foreground dark:bg-background dark:text-foreground dark:shadow-sm';
const SEGMENT_OFF = 'text-muted-foreground hover:text-foreground hover:bg-accent dark:hover:bg-transparent';

export function PeriodSwitch({ range, onChange }: { range: SnapshotRange; onChange: (range: SnapshotRange) => void }) {
    const t = useT();

    return (
        <div
            className="border-border bg-card dark:bg-muted inline-flex gap-0.5 rounded-lg border p-0.5 shadow-xs dark:border-transparent dark:shadow-none"
            role="group"
            aria-label={t('rep_period_label')}
        >
            {SNAPSHOT_PRESETS.map((p) => (
                <button
                    key={p}
                    type="button"
                    aria-pressed={range.period === p}
                    onClick={() => onChange({ period: p })}
                    className={cn(SEGMENT, range.period === p ? SEGMENT_ON : SEGMENT_OFF)}
                >
                    {t(`rep_period_${p}`)}
                </button>
            ))}
            <CustomRange range={range} onChange={onChange} />
        </div>
    );
}

/** "กำหนดเอง" — the button, and the panel that picks the dates. */
function CustomRange({ range, onChange }: { range: SnapshotRange; onChange: (range: SnapshotRange) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const active = range.period === 'custom';
    const [open, setOpen] = useState(false);
    // The panel edits a draft; the page's period only changes on "ใช้ช่วงนี้".
    const [draft, setDraft] = useState(() => periodRange(range));

    const handleOpenChange = (next: boolean) => {
        // Open on the dates on screen now, preset or custom, so the reader adjusts from there.
        if (next) setDraft(periodRange(range));
        setOpen(next);
    };

    const today = isoDate(new Date());
    const error =
        draft.from && draft.to && draft.to < draft.from
            ? t('rep_period_custom_order')
            : draft.from > today || draft.to > today
              ? t('rep_period_custom_future')
              : null;
    const canApply = !!draft.from && !!draft.to && !error;

    const apply = () => {
        onChange({ period: 'custom', from: draft.from, to: draft.to });
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <button type="button" aria-pressed={active} className={cn(SEGMENT, active ? SEGMENT_ON : SEGMENT_OFF)}>
                    <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                    {active ? compactRange(range.from, range.to, lang) : t('rep_period_custom')}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3">
                <p className="text-sm font-semibold">{t('rep_period_custom_title')}</p>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <label htmlFor="snap-from" className="text-muted-foreground text-xs">
                            {t('rep_period_custom_from')}
                        </label>
                        <DateInput id="snap-from" value={draft.from} onChange={(v) => setDraft((d) => ({ ...d, from: v }))} className="px-2.5" />
                    </div>
                    <div className="space-y-1">
                        <label htmlFor="snap-to" className="text-muted-foreground text-xs">
                            {t('rep_period_custom_to')}
                        </label>
                        <DateInput
                            id="snap-to"
                            value={draft.to}
                            onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
                            className={cn('px-2.5', error && 'border-destructive')}
                        />
                    </div>
                </div>
                {error && (
                    <p role="alert" className="text-destructive text-xs">
                        {error}
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                        {t('cancel')}
                    </Button>
                    <Button size="sm" onClick={apply} disabled={!canApply}>
                        {t('rep_period_custom_apply')}
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
