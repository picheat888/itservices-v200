/**
 * The Report Center's period control beside the heading: 7 วัน / 30 วัน / 90 วัน / กำหนดเอง.
 * The presets switch at once; "กำหนดเอง" opens the shared range calendar (shared/ui/date-range-input)
 * and applies only on "นำไปใช้", then the button itself shows the chosen dates ("1 ก.ย. – 2 ต.ค. 2026").
 * The calendar can't pick an end before the start and greys out days after today, so every range
 * it hands over is one the API takes. State: hooks/use-snapshot-range.ts.
 *
 * On the light page ground a muted track vanished, so in light it is a bordered card with the
 * chosen period in brand (as the Ticket page's range switch); dark keeps its muted track.
 */
import { useT } from '@/lang';
import { cn } from '@/shared/lib/utils';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { useUiStore } from '@/stores/ui';
import { CalendarRange } from 'lucide-react';
import { SNAPSHOT_PRESETS } from '../hooks/use-snapshot-range';
import type { SnapshotRange } from '../types';
import { compactRange, periodRange } from './report-scope';

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

/**
 * "กำหนดเอง" — the segment opens the shared two-month range calendar (as the report filter bars
 * do); the period changes only on "นำไปใช้". Days after today are greyed out, as the API caps
 * the range at today, and the calendar opens on the dates on screen now, preset or custom.
 */
function CustomRange({ range, onChange }: { range: SnapshotRange; onChange: (range: SnapshotRange) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const active = range.period === 'custom';
    const shown = periodRange(range);

    return (
        <DateRangeInput
            from={shown.from}
            to={shown.to}
            maxDate={new Date()}
            align="end"
            onChange={(from, to) => onChange({ period: 'custom', from, to })}
        >
            <button type="button" aria-pressed={active} className={cn(SEGMENT, active ? SEGMENT_ON : SEGMENT_OFF)}>
                <CalendarRange className="h-3.5 w-3.5" aria-hidden />
                {active ? compactRange(range.from, range.to, lang) : t('rep_period_custom')}
            </button>
        </DateRangeInput>
    );
}
