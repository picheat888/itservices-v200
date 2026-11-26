// Steps of the asset import dialog and the rules for moving between them. Pure logic, no React.
import type { CheckedRow, ImportKind } from '../api/assetImportApi';
import { badRowCount } from './import-rows.ts';

export type StepId = 'kind' | 'upload' | 'check' | 'contract' | 'summary';

export interface WizardState {
    kind: ImportKind | null;
    /** The chosen file, or null before one is picked. */
    file: File | null;
    /** Checked rows with the user's edits applied. */
    rows: CheckedRow[];
    /** The user chose to link the new assets to a contract (rented only). */
    linkContract: boolean;
    contractId: number | null;
}

/** Steps in order; the contract step exists for rentals only. */
export function importSteps(kind: ImportKind): StepId[] {
    return kind === 'rented' ? ['kind', 'upload', 'check', 'contract', 'summary'] : ['kind', 'upload', 'check', 'summary'];
}

/** Whether the next button of a step is enabled. */
export function canLeaveStep(step: StepId, state: WizardState): boolean {
    switch (step) {
        case 'kind':
            return state.kind !== null;
        case 'upload':
            return state.file !== null && state.rows.length > 0;
        case 'check':
            return state.rows.length > 0 && badRowCount(state.rows) === 0;
        case 'contract':
            return !state.linkContract || state.contractId !== null;
        default:
            return true;
    }
}

/** Where to send the user after the server refused the import. */
export function stepAfterRefusal(code: string): StepId {
    if (code === 'link_contract_not_open') return 'contract';
    if (code === 'import_rows_invalid' || code === 'import_conflict') return 'check';
    return 'summary';
}
