// Words for one login-log row: its event, the one reason line under it, and whether it is a failure; no React, so node tests load it as is.
import type { LoginEventRow } from '@/modules/auth/api/authApi';

type Translate = (key: string) => string;

export interface LoginEventWords {
    event: string;
    /** The line under the event, or null when the event says it all. */
    reason: string | null;
    /** Wrong password or locked: shown in destructive text. */
    failed: boolean;
}

/** The event and reason of a row, in the reader's language. */
export function loginEventWords(row: Pick<LoginEventRow, 'event' | 'reason' | 'remembered' | 'user'>, t: Translate): LoginEventWords {
    return {
        event: t(`login_event_${row.event}`),
        reason: reasonLine(row, t),
        failed: row.event === 'failed' || row.event === 'locked',
    };
}

function reasonLine(row: Pick<LoginEventRow, 'event' | 'reason' | 'remembered' | 'user'>, t: Translate): string | null {
    // A person's own sign-out is the event itself
    if (row.reason && row.reason !== 'signed_out') return t(`login_reason_${row.reason}`);
    if (row.event === 'signed_in' && row.remembered) return t('login_reason_remembered');
    if (row.event === 'failed' && row.user === null) return t('login_reason_unknown_account');
    return null;
}
