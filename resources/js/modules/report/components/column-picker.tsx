/**
 * Column picker of a tabular report: a "Columns" button (with how many are hidden) opening
 * the shared FilterPopover panel of checkboxes, one per column. What stays ticked is what
 * the table shows and what the Excel/PDF export carries. State lives in useHiddenColumns.
 * Sits at the right of the rows card heading, so the trigger is the small size and the
 * panel opens right-aligned under it.
 */
import { useT } from '@/lang';
import { FilterPopover } from '@/shared/components/filter-popover';
import { Checkbox } from '@/shared/ui/checkbox';
import { Columns3 } from 'lucide-react';
import type { TabularDefinition } from '../types';

export function ColumnPicker({
    definition,
    hidden,
    onToggle,
    onShowAll,
}: {
    definition: TabularDefinition;
    hidden: string[];
    onToggle: (key: string) => void;
    onShowAll: () => void;
}) {
    const t = useT();
    const lastVisible = hidden.length + 1 >= definition.columns.length;

    return (
        <FilterPopover count={hidden.length} onClear={onShowAll} label={t('rep_columns')} icon={Columns3} size="sm" align="end">
            {() => (
                <div className="space-y-1">
                    <p className="text-muted-foreground pb-1 text-xs">{t('rep_columns_hint')}</p>
                    <div className="max-h-72 space-y-0.5 overflow-y-auto">
                        {definition.columns.map((column) => {
                            const shown = !hidden.includes(column.key);
                            const locked = shown && lastVisible;
                            return (
                                <label
                                    key={column.key}
                                    htmlFor={`col-${column.key}`}
                                    className="hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm has-[:disabled]:cursor-not-allowed"
                                >
                                    <Checkbox
                                        id={`col-${column.key}`}
                                        checked={shown}
                                        disabled={locked}
                                        onCheckedChange={() => onToggle(column.key)}
                                    />
                                    <span className={shown ? '' : 'text-muted-foreground'}>{t(column.label_key)}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}
        </FilterPopover>
    );
}
