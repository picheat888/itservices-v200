// Screen after a finished asset import: how many came in, the code range, and the way on (the waiting list or the new rows).
// The dialog closes first; the two buttons only choose what the list shows afterwards.
import { useT } from '@/lang';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { Button } from '@/shared/ui/button';
import { CircleCheck, Hourglass } from 'lucide-react';
import type { ImportKind, ImportResult } from '../../api/assetImportApi';

interface Props {
    kind: ImportKind;
    result: ImportResult;
    /** Price total of the imported rows, shown for purchases. */
    totalValue: number;
    onShowImported: () => void;
    onShowAwaiting: () => void;
}

export function ImportDone({ kind, result, totalValue, onShowImported, onShowAwaiting }: Props) {
    const t = useT();
    const fmtN = useNumberFormat();
    const count = fmtN(result.imported);
    const waiting = kind === 'rented' && result.contract_code === null;

    return (
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-4 text-center">
            <CircleCheck className="h-12 w-12 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <div className="space-y-1">
                <h3 tabIndex={-1} className="text-xl font-bold tracking-tight text-balance tabular-nums">
                    {t(`asset_import_done_title_${kind}`).replace('{count}', count)}
                </h3>
                {result.first_code !== null && result.last_code !== null && (
                    <p className="text-muted-foreground text-sm">
                        {t('asset_import_done_codes')
                            .split(/(\{first\}|\{last\})/)
                            .map((part, i) =>
                                part === '{first}' || part === '{last}' ? (
                                    <span key={i} className="text-foreground font-semibold" translate="no">
                                        {part === '{first}' ? result.first_code : result.last_code}
                                    </span>
                                ) : (
                                    part
                                ),
                            )}
                    </p>
                )}
            </div>

            {/* Waiting for a contract: one plain row with its button */}
            {waiting && (
                <div className="border-border flex w-full flex-wrap items-center gap-3 rounded-lg border p-3 text-left">
                    <Hourglass className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold">{t('asset_import_done_waiting').replace('{count}', count)}</div>
                        <div className="text-muted-foreground text-xs">{t('asset_import_done_waiting_sub')}</div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={onShowAwaiting}>
                        {t('asset_import_done_show_waiting')}
                    </Button>
                </div>
            )}

            {/* Linked rentals and purchases */}
            {!waiting && (
                <div className="flex flex-col items-center gap-3">
                    <p className="text-sm tabular-nums">
                        {kind === 'rented'
                            ? t('asset_import_done_linked')
                                  .split(/(\{count\}|\{code\})/)
                                  .map((part, i) =>
                                      part === '{code}' ? (
                                          <span key={i} className="font-semibold" translate="no">
                                              {result.contract_code}
                                          </span>
                                      ) : part === '{count}' ? (
                                          count
                                      ) : (
                                          part
                                      ),
                                  )
                            : t('asset_import_summary_value').replace('{value}', fmtN(totalValue, { decimals: 2 }))}
                    </p>
                    <Button type="button" variant="outline" size="sm" onClick={onShowImported}>
                        {t('asset_import_done_show_imported')}
                    </Button>
                </div>
            )}
        </div>
    );
}
