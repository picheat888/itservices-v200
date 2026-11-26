// Asset import dialog: holds the wizard state and shows one step at a time (buy or rent, upload, then the later steps).
// Open state lives in the URL as ?dialog=import; a chosen file is guarded against an accidental close.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { FormErrorBanner } from '@/shared/components/field';
import type { SearchOption } from '@/shared/components/searchable-select';
import { useDateFormat } from '@/shared/hooks/use-date-format';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { useNumberFormat } from '@/shared/hooks/use-number-format';
import { useSelectRefresh } from '@/shared/hooks/use-select-refresh';
import { serverFailureText, serverMessage } from '@/shared/lib/api-errors';
import { isServerFailure } from '@/shared/lib/http-errors';
import { localPair } from '@/shared/lib/local-name';
import { reasonWords } from '@/shared/lib/reason-words';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooterBar, focusDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Upload } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AssetContractOption } from '../../api/assetApi';
import type { ImportKind, ImportPreview, ImportResult, Issue } from '../../api/assetImportApi';
import { useAssetImport } from '../../hooks/use-asset-import';
import { useAssetContractOptions } from '../../hooks/use-assets';
import type { ImportColumnKey } from '../../lib/import-columns';
import {
    importRunPayload,
    overlayFromRefusal,
    rowsWithEdits,
    withServerIssues,
    type CellEdit,
    type RowEdits,
    type ServerIssueOverlay,
} from '../../lib/import-rows';
import { canLeaveStep, importSteps, stepAfterRefusal, type StepId, type WizardState } from '../../lib/import-wizard';
import { ImportCheckStep, NEXT_BLOCKED_ID } from './import-check-step';
import { ImportContractStep } from './import-contract-step';
import { ImportDone } from './import-done';
import { ImportKindStep } from './import-kind-step';
import { ImportStepper } from './import-stepper';
import { ImportRunButton, ImportSummaryStep } from './import-summary-step';
import { ImportUploadStep } from './import-upload-step';

interface State {
    step: StepId;
    kind: ImportKind | null;
    file: File | null;
    /** What the server made of the chosen file; null until its check passes. */
    preview: ImportPreview | null;
    edits: RowEdits;
    /** What the server refused per line; shown on the cells until they change. */
    serverIssues: ServerIssueOverlay;
    linkContract: boolean;
    contractId: number | null;
    /** Set once the import ran; later steps read it for the done screen. */
    result: ImportResult | null;
}

type Action =
    | { type: 'reset' }
    | { type: 'kind'; kind: ImportKind }
    | { type: 'file'; file: File }
    | { type: 'clearFile' }
    | { type: 'previewed'; preview: ImportPreview }
    | { type: 'edit'; line: number; column: ImportColumnKey; value: CellEdit }
    | { type: 'contract'; link: boolean; id: number | null }
    | { type: 'refused'; step: StepId; overlay: ServerIssueOverlay | null; clearContract: boolean }
    | { type: 'done'; result: ImportResult }
    | { type: 'go'; step: StepId };

const INITIAL: State = {
    step: 'kind',
    kind: 'rented',
    file: null,
    preview: null,
    edits: {},
    serverIssues: {},
    linkContract: false,
    contractId: null,
    result: null,
};

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'reset':
            return INITIAL;
        // A new kind means another template: the file, its check and the edits go
        case 'kind':
            return { ...INITIAL, kind: action.kind, step: state.step };
        case 'file':
            return { ...state, file: action.file, preview: null, edits: {}, serverIssues: {} };
        case 'clearFile':
            return { ...state, file: null, preview: null, edits: {}, serverIssues: {} };
        case 'previewed':
            return { ...state, preview: action.preview };
        // Only the edited row gets a new object, so the other rows keep their place
        case 'edit':
            return { ...state, edits: { ...state.edits, [action.line]: { ...state.edits[action.line], [action.column]: action.value } } };
        case 'contract':
            return { ...state, linkContract: action.link, contractId: action.link ? action.id : null };
        // A refusal moves the wizard; a refused contract is forgotten so the picker asks again
        case 'refused':
            return {
                ...state,
                step: action.step,
                serverIssues: action.overlay ?? state.serverIssues,
                contractId: action.clearContract ? null : state.contractId,
            };
        case 'done':
            return { ...state, result: action.result };
        case 'go':
            return { ...state, step: action.step };
    }
}

/** ?dialog=import for the asset page: whether the dialog is open and how to open and close it. */
export function useAssetImportDialog() {
    const [dialog, setDialog] = useDialogParam(['import']);
    return { open: dialog === 'import', openImport: () => setDialog('import'), closeImport: () => setDialog(null) };
}

interface DialogProps {
    open: boolean;
    onClose: () => void;
    /** Shows the assets waiting for a contract on the list; the done screen calls it after closing the dialog. */
    onShowAwaiting: () => void;
    /** Shows the asset list with the imported rows; the done screen calls it after closing the dialog. */
    onShowImported: () => void;
}

/** The refusal body the server sent: its code and, for invalid rows, the issues per sheet line. */
function refusalBody(error: unknown): { code: string; lines: { row: number; issues: Issue[] }[] } {
    const data = (error as { response?: { data?: { message?: unknown; errors?: unknown } } })?.response?.data;
    const lines = Array.isArray(data?.errors) ? (data.errors as { row: number; issues: Issue[] }[]) : [];
    return { code: typeof data?.message === 'string' ? data.message : '', lines };
}

export function AssetImportDialog({ open, onClose, onShowAwaiting, onShowImported }: DialogProps) {
    const t = useT();
    const fmtN = useNumberFormat();
    const confirm = useConfirm();
    const dateFormat = useUiStore((s) => s.dateConfig.format);
    const lang = useUiStore((s) => s.lang);
    const fmtDate = useDateFormat();
    const { preview: previewFile, run, downloadTemplate } = useAssetImport();
    const resetPreview = previewFile.reset;
    const [state, dispatch] = useReducer(reducer, INITIAL);
    const [refusal, setRefusal] = useState<string | null>(null);
    // A refusal of the import itself, shown above the step it sent the user to
    const [runRefusal, setRunRefusal] = useState<{ message: string; key: number } | null>(null);
    const body = useRef<HTMLDivElement>(null);
    // Answers of a file that was replaced or removed meanwhile are dropped
    const pickToken = useRef(0);

    // A fresh wizard each time the dialog opens, before the first paint so no old step shows
    useLayoutEffect(() => {
        if (!open) return;
        dispatch({ type: 'reset' });
        setRefusal(null);
        setRunRefusal(null);
        pickToken.current += 1;
        resetPreview();
    }, [open, resetPreview]);

    const { kind, step } = state;
    const contractsQuery = useAssetContractOptions(open && kind === 'rented');
    const refreshContracts = useSelectRefresh(contractsQuery);
    const openContracts = useMemo(() => (contractsQuery.data ?? []).filter((c) => !c.closed), [contractsQuery.data]);
    const contractLabel = useCallback((c: AssetContractOption) => `${c.code} - ${localPair(c.vendor, c.vendor_th, lang) ?? ''}`, [lang]);
    const contractChoices = useMemo<SearchOption[]>(
        () =>
            openContracts.map((c) => ({
                value: String(c.id),
                label: contractLabel(c),
                search: `${c.code} ${c.vendor ?? ''} ${c.vendor_th ?? ''} ${c.details ?? ''}`,
                sub: c.end_date ? t('asset_contract_ends').replace('{date}', fmtDate.date(c.end_date)) : undefined,
            })),
        [openContracts, contractLabel, t, fmtDate],
    );
    // Looked up among all contracts so a refetch that drops it does not make the summary say it is not linked
    const chosenContract = state.linkContract ? ((contractsQuery.data ?? []).find((c) => c.id === state.contractId) ?? null) : null;
    const steps = importSteps(kind ?? 'rented');
    const rows = useMemo(
        () =>
            state.preview && kind
                ? withServerIssues(rowsWithEdits(state.preview.rows, state.edits, state.preview.options, kind, dateFormat), state.serverIssues)
                : [],
        [state.preview, state.edits, state.serverIssues, kind, dateFormat],
    );
    const totalValue = useMemo(() => rows.reduce((sum, row) => sum + (Number(row.values.value) || 0), 0), [rows]);
    const wizard: WizardState = { kind, file: state.file, rows, linkContract: state.linkContract, contractId: state.contractId };
    const busy = previewFile.isPending || run.isPending;
    const hasEdits = Object.keys(state.edits).length > 0;
    const guardClose = useDiscardGuard(open && state.file !== null && state.result === null);

    // Asks before edits from the check step are thrown away
    const confirmLoseEdits = async () =>
        !hasEdits ||
        (await confirm({ variant: 'warn', title: t('asset_import_change_file_title'), description: t('asset_import_change_file_desc') }));

    const dropFile = () => {
        pickToken.current += 1;
        previewFile.reset();
        setRefusal(null);
    };

    const changeKind = async (next: ImportKind) => {
        if (next === kind) return;
        if (state.file !== null && !(await confirmLoseEdits())) return;
        dropFile();
        dispatch({ type: 'kind', kind: next });
    };

    const pickFile = async (file: File) => {
        if (kind === null || !(await confirmLoseEdits())) return;
        dropFile();
        dispatch({ type: 'file', file });
        const token = pickToken.current;
        previewFile.mutate(
            { kind, file },
            {
                onSuccess: (preview) => token === pickToken.current && dispatch({ type: 'previewed', preview }),
                onError: (error) => token === pickToken.current && setRefusal(refusalWords(error)),
            },
        );
    };

    /** True when the file was removed; false when the user kept it. */
    const removeFile = async () => {
        if (!(await confirmLoseEdits())) return false;
        dropFile();
        dispatch({ type: 'clearFile' });
        return true;
    };

    // The server's file refusal in words; a wrong-template file names the kind it is, counts are formatted
    const refusalWords = (error: unknown): string => {
        const words = reasonWords(error, t, 'asset_refusal_', (name, value) => {
            if (name === 'kind') return t(`asset_import_kind_${String(value)}`);
            return typeof value === 'number' ? fmtN(value) : String(value ?? '');
        });
        return words ?? (isServerFailure(error) ? (serverMessage(error) ?? '') : t('asset_refusal_import_unreadable'));
    };

    // Focus follows the user to the heading of each new step, and of the done screen
    useEffect(() => {
        if (step !== 'kind') body.current?.querySelector<HTMLElement>('h3')?.focus({ preventScroll: true });
    }, [step, state.result]);

    const editCell = useCallback((line: number, column: ImportColumnKey, value: CellEdit) => {
        setRunRefusal(null);
        dispatch({ type: 'edit', line, column, value });
    }, []);

    const goTo = (target: StepId) => {
        setRunRefusal(null);
        dispatch({ type: 'go', step: target });
    };
    const goNext = () => {
        const next = steps[steps.indexOf(step) + 1];
        if (next) goTo(next);
    };
    const goBack = () => {
        const before = steps[steps.indexOf(step) - 1];
        if (before) goTo(before);
    };

    // Runs the import; a refusal moves to the step that can fix it and says why above that step
    const runImport = () => {
        if (kind === null || run.isPending) return;
        setRunRefusal(null);
        const contractId = kind === 'rented' && state.linkContract ? state.contractId : null;
        run.mutate(importRunPayload(kind, rows, contractId, dateFormat), {
            onSuccess: (result) => dispatch({ type: 'done', result }),
            onError: (error) => {
                const { code, lines } = refusalBody(error);
                const overlay = code === 'import_rows_invalid' ? overlayFromRefusal(lines, rows) : null;
                if (code === 'link_contract_not_open') void contractsQuery.refetch();
                setRunRefusal({ message: serverMessage(error, t, 'asset_refusal_') ?? serverFailureText(error), key: Date.now() });
                dispatch({ type: 'refused', step: stepAfterRefusal(code), overlay, clearContract: code === 'link_contract_not_open' });
            },
        });
    };

    // The done screen closes the dialog first; the page applies the choice once the dialog is gone
    const finish = (then?: () => void) => {
        onClose();
        then?.();
    };

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !run.isPending && guardClose(onClose)}>
            <DialogContent
                className={focusDialogContentClass}
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                    const chosen = body.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked');
                    (chosen ?? (event.currentTarget as HTMLElement | null))?.focus({ preventScroll: true });
                }}
            >
                {/* Header */}
                <FocusDialogHeader
                    icon={Upload}
                    eyebrow={t('asset_label')}
                    title={step === 'kind' || kind === null ? t('asset_import_title') : t(`asset_import_title_${kind}`)}
                    subtitle={<span className="text-muted-foreground text-sm">{t('asset_import_sub')}</span>}
                    srDescription={t('asset_import_sub')}
                />

                {/* Stepper */}
                <ImportStepper steps={steps} current={step} locked={busy || state.result !== null} finished={state.result !== null} onGo={goTo} />

                {/* Body, top-aligned */}
                <div ref={body} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-6">
                    {runRefusal && (
                        <FormErrorBanner
                            message={runRefusal.message}
                            shakeKey={runRefusal.key}
                            className="mx-auto mb-4 w-full max-w-[760px] shrink-0"
                        />
                    )}
                    {renderStep()}
                </div>

                {/* Footer nav */}
                <DialogFooterBar className={state.result ? 'justify-end' : 'justify-between'}>
                    {state.result ? (
                        <Button type="button" onClick={() => finish()}>
                            {t('asset_import_done_close')}
                        </Button>
                    ) : step === 'kind' ? (
                        <Button type="button" variant="ghost" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                    ) : (
                        <Button type="button" variant="ghost" disabled={busy} onClick={goBack}>
                            {t('asset_import_back')}
                        </Button>
                    )}
                    {!state.result &&
                        (step === 'summary' ? (
                            <ImportRunButton running={run.isPending} onRun={runImport} />
                        ) : (
                            <Button
                                type="button"
                                disabled={busy || !canLeaveStep(step, wizard)}
                                aria-describedby={step === 'check' && !canLeaveStep(step, wizard) ? NEXT_BLOCKED_ID : undefined}
                                onClick={goNext}
                            >
                                {step === 'upload' ? t('asset_import_check_files') : t('asset_import_next')}
                            </Button>
                        ))}
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );

    // Step switch
    function renderStep() {
        if (state.result !== null && kind !== null)
            return (
                <ImportDone
                    kind={kind}
                    result={state.result}
                    totalValue={totalValue}
                    onShowImported={() => finish(onShowImported)}
                    onShowAwaiting={() => finish(onShowAwaiting)}
                />
            );
        switch (step) {
            case 'kind':
                return <ImportKindStep kind={kind} onChange={changeKind} />;
            case 'upload':
                return kind === null ? null : (
                    <ImportUploadStep
                        kind={kind}
                        file={state.file}
                        rowCount={state.preview?.meta.total ?? null}
                        busy={previewFile.isPending}
                        refusal={refusal}
                        onPick={pickFile}
                        onRemove={removeFile}
                        onDownload={() => downloadTemplate(kind)}
                    />
                );
            case 'check':
                return kind === null || state.preview === null ? null : (
                    <ImportCheckStep
                        kind={kind}
                        fileName={state.file?.name ?? ''}
                        rows={rows}
                        options={state.preview.options}
                        edits={state.edits}
                        onEdit={editCell}
                    />
                );
            case 'contract':
                return (
                    <ImportContractStep
                        count={rows.length}
                        linkContract={state.linkContract}
                        contractId={state.contractId}
                        options={contractChoices}
                        loading={contractsQuery.isLoading}
                        refresh={refreshContracts}
                        onChange={(link, id) => {
                            setRunRefusal(null);
                            dispatch({ type: 'contract', link, id });
                        }}
                    />
                );
            case 'summary':
                return kind === null || state.preview === null ? null : (
                    <ImportSummaryStep
                        kind={kind}
                        fileName={state.file?.name ?? ''}
                        rows={rows}
                        options={state.preview.options}
                        contractLabel={chosenContract ? contractLabel(chosenContract) : null}
                        totalValue={totalValue}
                        running={run.isPending}
                        onChangeContract={() => goTo('contract')}
                    />
                );
            default:
                return null;
        }
    }
}
