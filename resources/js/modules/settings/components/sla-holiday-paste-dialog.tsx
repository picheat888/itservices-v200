// Paste dialog (560) over the holiday editor: reads an announcement line by line and adds the readable days to the table.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNavigationGuard } from '@/shared/hooks/use-navigation-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogBody, DialogFooterBar, FormDialogContent } from '@/shared/ui/dialog';
import { Textarea } from '@/shared/ui/textarea';
import { ClipboardPaste } from 'lucide-react';
import { useMemo, useState } from 'react';
import { isoWeekday, parseHolidayText, type LineError } from '../lib/sla-holidays';
import { fillText } from './sla-parts';

const LINE_ERROR_KEY: Record<LineError, string> = {
    no_date: 'set_hol_line_no_date',
    bad_date: 'set_hol_line_bad_date',
    no_name: 'set_hol_line_no_name',
    other_year: 'set_hol_line_other_year',
};

export function SlaHolidayPasteDialog({
    open,
    year,
    existing,
    onClose,
    onAdd,
    returnFocusTo,
}: {
    open: boolean;
    year: number;
    existing: string[];
    onClose: () => void;
    onAdd: (rows: { date: string; name: string }[]) => void;
    /** Id of the control that takes focus back when the dialog closes. */
    returnFocusTo: string;
}) {
    const t = useT();
    const fmt = useDateFormat();
    const fmtN = useNumberFormat();
    const [text, setText] = useState('');

    // Each opening starts with an empty box
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) setText('');
    }

    const guardClose = useDiscardGuard(open && text.trim() !== '');
    // Back closes the editor underneath, so pasted text asks first there too
    useNavigationGuard(open && text.trim() !== '', ['holidays_edit']);
    const read = useMemo(() => parseHolidayText(text, year, existing), [text, year, existing]);
    const hasText = text.trim() !== '';
    const examples = { year, be: year + 543 };

    const lineError = (error: string, found?: number) =>
        fillText(t(LINE_ERROR_KEY[error as LineError] ?? 'set_hol_line_no_date'), {
            found: found === undefined ? '' : fmt.year(found),
            year: fmt.year(year),
        });

    return (
        <Dialog open={open} onOpenChange={(o) => !o && guardClose(onClose)}>
            <FormDialogContent
                onCloseAutoFocus={(e) => {
                    e.preventDefault();
                    document.getElementById(returnFocusTo)?.focus();
                }}
            >
                <FocusDialogHeader
                    icon={ClipboardPaste}
                    eyebrow={fillText(t('set_hol_year'), { year: fmt.year(year) })}
                    title={t('set_hol_paste')}
                    srDescription={t('set_hol_paste_label')}
                />
                <DialogBody className="space-y-2.5 py-4">
                    <label htmlFor="hol-paste-text" className="block text-sm">
                        {t('set_hol_paste_label')}
                    </label>
                    <Textarea
                        id="hol-paste-text"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={fillText(t('set_hol_paste_ph'), examples)}
                        autoComplete="off"
                        className="min-h-[150px] resize-y leading-relaxed"
                    />
                    <div aria-live="polite" className="flex flex-col gap-1.5 text-sm">
                        {!hasText ? (
                            <span className="text-muted-foreground">{fillText(t('set_hol_paste_hint'), examples)}</span>
                        ) : (
                            <>
                                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                    {fillText(t('set_hol_read_ok'), { n: fmtN(read.ok.length) })}
                                </span>
                                {read.ok.length > 0 && (
                                    <div className="border-border max-h-40 overflow-auto rounded-lg border">
                                        {read.ok.map((p) => (
                                            <div
                                                key={p.date}
                                                className="border-border grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-t px-2.5 py-1 first:border-t-0"
                                            >
                                                <span className="tabular-nums">{`${t(`set_sla_day_${isoWeekday(p.date)}`)} ${fmt.date(p.date)}`}</span>
                                                <span className="min-w-0">{p.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {read.duplicates > 0 && (
                                    <span className="text-muted-foreground">{fillText(t('set_hol_read_dup'), { n: fmtN(read.duplicates) })}</span>
                                )}
                                {read.bad.length > 0 && (
                                    <>
                                        <span className="dark:text-destructive text-red-700">
                                            {fillText(t('set_hol_read_bad'), { n: fmtN(read.bad.length) })}
                                        </span>
                                        <ul className="dark:text-destructive list-disc space-y-0.5 pl-5 text-red-700">
                                            {read.bad.map((b) => (
                                                <li key={b.line}>
                                                    {fillText(t('set_hol_read_line'), {
                                                        line: fmtN(b.line),
                                                        text: b.text,
                                                        error: lineError(b.error, b.found),
                                                    })}
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </DialogBody>
                <DialogFooterBar>
                    <Button type="button" variant="outline" onClick={() => guardClose(onClose)}>
                        {t('cancel')}
                    </Button>
                    <Button type="button" onClick={() => onAdd(read.ok)} disabled={read.ok.length === 0}>
                        {read.ok.length > 0 ? fillText(t('set_hol_paste_add_n'), { n: fmtN(read.ok.length) }) : t('set_hol_paste_add')}
                    </Button>
                </DialogFooterBar>
            </FormDialogContent>
        </Dialog>
    );
}
