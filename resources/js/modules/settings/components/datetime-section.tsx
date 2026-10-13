// Settings → System: the system-wide date format, year (CE/BE) and clock, with a live example.
import { useT } from '@/lang';
import { Field } from '@/shared/components/field';
import { SaveButton } from '@/shared/components/save-button';
import { bindDateFormat, DATE_FORMATS, type DateConfig, type DateEra, type DateFormat, type TimeFormat } from '@/shared/lib/datetime';
import { cn } from '@/shared/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { useUiStore } from '@/stores/ui';
import { useEffect, useMemo, useState } from 'react';
import { useUpdateDateTime } from '../hooks/use-settings';

const SEGMENT = 'rounded-md px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:py-2';
const segmentTone = (active: boolean) => (active ? 'bg-brand text-brand-foreground' : 'text-muted-foreground hover:text-foreground');

function Segmented<T extends string>({
    value,
    options,
    onChange,
}: {
    value: T;
    options: { value: T; label: string }[];
    onChange: (next: T) => void;
}) {
    return (
        <div className="border-border inline-flex rounded-lg border p-0.5">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(SEGMENT, segmentTone(value === o.value))}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

export function DateTimeSection({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
    const t = useT();
    const lang = useUiStore((s) => s.lang);
    const saved = useUiStore((s) => s.dateConfig);
    const update = useUpdateDateTime();
    const [draft, setDraft] = useState<DateConfig>(saved);
    const [done, setDone] = useState(false);

    useEffect(() => {
        setDraft(saved);
    }, [saved]);

    const dirty = draft.format !== saved.format || draft.era !== saved.era || draft.time !== saved.time;
    useEffect(() => {
        onDirtyChange(dirty);
        return () => onDirtyChange(false);
    }, [dirty, onDirtyChange]);

    const now = useMemo(() => new Date(), []);
    const example = bindDateFormat(draft, lang).dateTime(now);
    const change = (next: Partial<DateConfig>) => {
        setDone(false);
        setDraft((d) => ({ ...d, ...next }));
    };

    const save = async () => {
        setDone(false);
        try {
            await update.mutateAsync({ date_format: draft.format, date_era: draft.era, time_format: draft.time });
            setDone(true);
        } catch {
            // useSaveFailed already toasted the refusal.
        }
    };

    return (
        <div className="space-y-5">
            <Field label={t('set_date_format')}>
                <Select value={draft.format} onValueChange={(v) => change({ format: v as DateFormat })}>
                    <SelectTrigger>
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

            <Field label={t('set_date_era')}>
                <Segmented<DateEra>
                    value={draft.era}
                    onChange={(era) => change({ era })}
                    options={[
                        { value: 'ce', label: t('set_era_ce') },
                        { value: 'be', label: t('set_era_be') },
                    ]}
                />
            </Field>

            <Field label={t('set_time_format')}>
                <Segmented<TimeFormat>
                    value={draft.time}
                    onChange={(time) => change({ time })}
                    options={[
                        { value: '24', label: t('set_time_24') },
                        { value: '12', label: t('set_time_12') },
                    ]}
                />
            </Field>

            <p className="text-sm">
                <span className="text-muted-foreground mr-2">{t('set_datetime_example')}</span>
                <span className="font-medium tabular-nums">{example}</span>
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
                <SaveButton onClick={save} loading={update.isPending} success={done} disabled={!dirty}>
                    {t('save')}
                </SaveButton>
            </div>
        </div>
    );
}
