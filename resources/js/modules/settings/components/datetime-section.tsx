// Settings → System: the system-wide date format, year (CE/BE) and clock; a one-line example on top, the three choices in one row.
import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { bindDateFormat, DATE_FORMATS, type DateConfig, type DateEra, type DateFormat, type TimeFormat } from '@/shared/lib/datetime';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useUpdateDateTime } from '../hooks/use-settings';
import type { SavedSectionProps } from '../types';
import { SegmentedRadio } from './segmented-radio';

export function DateTimeSection({ onStatusChange, saverRef }: SavedSectionProps) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const saved = useUiStore((s) => s.dateConfig);
    const update = useUpdateDateTime();
    const [draft, setDraft] = useState<DateConfig>(saved);

    useEffect(() => {
        setDraft(saved);
    }, [saved]);

    const dirty = draft.format !== saved.format || draft.era !== saved.era || draft.time !== saved.time;
    useEffect(() => {
        onStatusChange({ dirty, guard: dirty });
    }, [dirty, onStatusChange]);

    const now = useMemo(() => new Date(), []);
    const change = (next: Partial<DateConfig>) => setDraft((d) => ({ ...d, ...next }));

    const save = async () => {
        try {
            await update.mutateAsync({ date_format: draft.format, date_era: draft.era, time_format: draft.time });
            return true;
        } catch {
            // useSaveFailed already toasted the refusal.
            return false;
        }
    };
    useImperativeHandle(saverRef, () => ({ save }));

    return (
        <div className="flex flex-col gap-5">
            {/* Example */}
            <p className="bg-muted/40 border-border flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg border px-4 py-2.5">
                <span className="text-muted-foreground text-sm">{t('set_datetime_preview')}</span>
                <span className="text-base font-semibold tabular-nums" aria-live="polite">
                    {bindDateFormat(draft, lang).dateTime(now)}
                </span>
            </p>

            {/* Format, year, clock */}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
                <div className="w-full sm:w-56">
                    <Field label={t('set_date_format')} controlId="date-format">
                        <Select value={draft.format} onValueChange={(v) => change({ format: v as DateFormat })}>
                            <SelectTrigger id="date-format">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DATE_FORMATS.map((f) => (
                                    <SelectItem key={f} value={f}>
                                        {bindDateFormat({ ...draft, format: f }, lang).date(now)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                </div>
                <SegmentedRadio<DateEra>
                    name="date-era"
                    legend={t('set_date_era')}
                    showLegend
                    value={draft.era}
                    onChange={(era) => change({ era })}
                    options={[
                        { value: 'be', label: t('set_era_be') },
                        { value: 'ce', label: t('set_era_ce') },
                    ]}
                />
                <SegmentedRadio<TimeFormat>
                    name="time-format"
                    legend={t('set_time_format')}
                    showLegend
                    value={draft.time}
                    onChange={(time) => change({ time })}
                    options={[
                        { value: '24', label: t('set_time_24') },
                        { value: '12', label: t('set_time_12') },
                    ]}
                />
            </div>
        </div>
    );
}
