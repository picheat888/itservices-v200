// Requests list "วันที่ยื่น" filter: the last 7 / 30 / 90 days or a custom range, written to ?filed_days or ?filed_from&filed_to.
import { useT } from '@/lang';
import { SearchableSelect } from '@/shared/components/searchable-select';
import { ToneDot } from '@/shared/components/status-badge';
import { DateRangeInput } from '@/shared/ui/date-range-input';
import { useState } from 'react';

const ALL = '__all__';
const CUSTOM = 'custom';
const PRESETS = ['7', '30', '90'];

export interface FiledFilter {
    days: string;
    from: string;
    to: string;
}

/** The URL patch for a filed filter: one form at a time, the other keys cleared. */
export type FiledPatch = { filed_days: string | null; filed_from: string | null; filed_to: string | null };

export function FiledDateFilter({ id, value, onChange }: { id: string; value: FiledFilter; onChange: (patch: FiledPatch) => void }) {
    const t = useT();
    const hasRange = !!value.from && !!value.to;
    // "กำหนดเอง" picked but no range applied yet
    const [customPending, setCustomPending] = useState(false);
    const selected = hasRange || customPending ? CUSTOM : PRESETS.includes(value.days) ? value.days : ALL;

    const pick = (next: string) => {
        setCustomPending(next === CUSTOM);
        if (next === CUSTOM) return;
        onChange({ filed_days: next === ALL ? null : next, filed_from: null, filed_to: null });
    };

    return (
        <div className="space-y-2">
            <SearchableSelect
                id={id}
                active={selected !== ALL}
                value={selected}
                onChange={pick}
                options={[
                    { value: ALL, label: t('all'), search: t('all'), icon: <ToneDot tone="gray" /> },
                    ...PRESETS.map((d) => {
                        const label = t('period_days').replace('{n}', d);
                        return { value: d, label, search: label };
                    }),
                    { value: CUSTOM, label: t('period_custom'), search: t('period_custom') },
                ]}
            />
            {selected === CUSTOM && (
                <DateRangeInput
                    from={value.from}
                    to={value.to}
                    maxDate={new Date()}
                    onChange={(from, to) => {
                        setCustomPending(false);
                        onChange({ filed_days: null, filed_from: from, filed_to: to });
                    }}
                />
            )}
        </div>
    );
}
