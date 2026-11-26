// Asset import dialog: holds the wizard state and shows one step at a time (buy or rent, upload, then the later steps).
// Open state lives in the URL as ?dialog=import; a chosen file is guarded against an accidental close.
import { useT } from '@/lang';
import { FocusDialogHeader } from '@/shared/components/dialog-header';
import { useDialogParam } from '@/shared/hooks/use-dialog-param';
import { useDiscardGuard } from '@/shared/hooks/use-discard-guard';
import { serverFailureText } from '@/shared/lib/api-errors';
import { isServerFailure } from '@/shared/lib/http-errors';
import { reasonWords } from '@/shared/lib/reason-words';
import { Button } from '@/shared/ui/button';
import { useConfirm } from '@/shared/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooterBar, focusDialogContentClass } from '@/shared/ui/dialog';
import { useUiStore } from '@/stores/ui';
import { Upload } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ImportKind, ImportPreview, ImportResult } from '../../api/assetImportApi';
import { useAssetImport } from '../../hooks/use-asset-import';
import { IMPORT_COLUMNS } from '../../lib/import-columns';
import { rowsWithEdits, type RowEdits } from '../../lib/import-rows';
import { canLeaveStep, importSteps, type StepId, type WizardState } from '../../lib/import-wizard';
import { ImportKindStep } from './import-kind-step';
import { ImportStepper } from './import-stepper';
import { ImportUploadStep } from './import-upload-step';

interface State {
    step: StepId;
    kind: ImportKind | null;
    file: File | null;
    /** What the server made of the chosen file; null until its check passes. */
    preview: ImportPreview | null;
    edits: RowEdits;
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
    | { type: 'go'; step: StepId };

const INITIAL: State = { step: 'kind', kind: 'rented', file: null, preview: null, edits: {}, linkContract: false, contractId: null, result: null };

function reducer(state: State, action: Action): State {
    switch (action.type) {
        case 'reset':
            return INITIAL;
        // A new kind means another template: the file, its check and the edits go
        case 'kind':
            return { ...INITIAL, kind: action.kind, step: state.step };
        case 'file':
            return { ...state, file: action.file, preview: null, edits: {} };
        case 'clearFile':
            return { ...state, file: null, preview: null, edits: {} };
        case 'previewed':
            return { ...state, preview: action.preview };
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
    /** Shows the assets waiting for a contract on the list; the done screen calls it. */
    onShowAwaiting: () => void;
}

export function AssetImportDialog({ open, onClose }: DialogProps) {
    const t = useT();
    const confirm = useConfirm();
    const dateFormat = useUiStore((s) => s.dateConfig.format);
    const { preview: previewFile, run, downloadTemplate } = useAssetImport();
    const resetPreview = previewFile.reset;
    const [state, dispatch] = useReducer(reducer, INITIAL);
    const [refusal, setRefusal] = useState<string | null>(null);
    const body = useRef<HTMLDivElement>(null);
    // Answers of a file that was replaced or removed meanwhile are dropped
    const pickToken = useRef(0);

    // A fresh wizard each time the dialog opens
    useEffect(() => {
        if (!open) return;
        dispatch({ type: 'reset' });
        setRefusal(null);
        pickToken.current += 1;
        resetPreview();
    }, [open, resetPreview]);

    const { kind, step } = state;
    const steps = importSteps(kind ?? 'rented');
    const rows = useMemo(
        () => (state.preview && kind ? rowsWithEdits(state.preview.rows, state.edits, state.preview.options, kind, dateFormat) : []),
        [state.preview, state.edits, kind, dateFormat],
    );
    const wizard: WizardState = { kind, file: state.file, rows, linkContract: state.linkContract, contractId: state.contractId };
    const busy = previewFile.isPending || run.isPending;
    const hasEdits = Object.keys(state.edits).length > 0;
    const guardClose = useDiscardGuard(state.file !== null && state.result === null);

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

    const removeFile = async () => {
        if (!(await confirmLoseEdits())) return;
        dropFile();
        dispatch({ type: 'clearFile' });
    };

    // The server's file refusal in words; a wrong-template file names the kind it is, a missing column its header
    const refusalWords = (error: unknown): string => {
        const header = (key: string) => IMPORT_COLUMNS[kind ?? 'rented'].find((column) => column.key === key)?.header ?? key;
        const words = reasonWords(error, t, 'asset_refusal_', (name, value) => {
            if (name === 'kind') return t(`asset_import_kind_${String(value)}`);
            if (name === 'columns') return String(value).split(', ').map(header).join(', ');
            return String(value ?? '');
        });
        return words ?? (isServerFailure(error) ? serverFailureText(error) : t('asset_refusal_import_unreadable'));
    };

    const goNext = () => {
        const next = steps[steps.indexOf(step) + 1];
        if (next) dispatch({ type: 'go', step: next });
    };
    const goBack = () => {
        const before = steps[steps.indexOf(step) - 1];
        if (before) dispatch({ type: 'go', step: before });
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
                <ImportStepper
                    steps={steps}
                    current={step}
                    locked={busy || state.result !== null}
                    onGo={(target) => dispatch({ type: 'go', step: target })}
                />

                {/* Body, top-aligned */}
                <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                    {renderStep()}
                </div>

                {/* Footer nav */}
                <DialogFooterBar className="justify-between">
                    {step === 'kind' ? (
                        <Button type="button" variant="ghost" onClick={() => guardClose(onClose)}>
                            {t('cancel')}
                        </Button>
                    ) : (
                        <Button type="button" variant="ghost" disabled={busy} onClick={goBack}>
                            {t('asset_import_back')}
                        </Button>
                    )}
                    <Button type="button" disabled={busy || !canLeaveStep(step, wizard)} onClick={goNext}>
                        {step === 'upload' ? t('asset_import_check_files') : t('asset_import_next')}
                    </Button>
                </DialogFooterBar>
            </DialogContent>
        </Dialog>
    );

    // Step switch: the check, contract and summary steps join here
    function renderStep() {
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
            default:
                return null;
        }
    }
}
