// A refused single recall: whether it means the recipient accepted the hand-over before IT pulled it back.
import type { AssetStatus } from '@/shared/types';

/** True only for the ordinary-recall refusal on an asset that was still a pending hand-over when the dialog opened. */
export function recipientAcceptedFirst(refusalCode: string | undefined, statusWhenOpened: AssetStatus | undefined): boolean {
    return refusalCode === 'recall_not_allowed' && statusWhenOpened === 'pending_acceptance';
}
