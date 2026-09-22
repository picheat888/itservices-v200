/**
 * Helpers for reading Laravel API error responses on the client.
 */
import { useToastStore } from '@/stores/toast';

interface ApiErrorShape {
    response?: {
        status?: number;
        data?: {
            message?: string;
            errors?: Record<string, string[]>;
        };
    };
}

/** True when an Axios error is a 422 validation error that carries the given field. */
export function hasFieldError(error: unknown, field: string): boolean {
    const e = error as ApiErrorShape;
    return e?.response?.status === 422 && !!e.response.data?.errors?.[field];
}

/** The first server-side validation message for a field, if any. */
export function fieldError(error: unknown, field: string): string | undefined {
    const e = error as ApiErrorShape;
    return e?.response?.data?.errors?.[field]?.[0];
}

/**
 * Show the standard toast for a failed master-data delete. A 409 means the item
 * is still referenced — the body shows the {count} of records still using it;
 * anything else falls back to a generic error toast.
 */
export function toastDeleteError(error: unknown, t: (key: string) => string, bodyKey = 'md_in_use', titleKey = 'md_in_use_title'): void {
    const res = (error as { response?: { status?: number; data?: { count?: number } } })?.response;
    if (res?.status === 409) {
        useToastStore.getState().push(t(bodyKey).replace('{count}', String(res.data?.count ?? 0)), 'error', t(titleKey));
    } else {
        useToastStore.getState().push(t('cd_error'), 'error', t('cd_error_title'));
    }
}

/**
 * The short reason a 422 refusal carries in `message` (e.g. 'has_history'), with the
 * rest of the body alongside it for the counts those messages quote. Undefined for any
 * other failure, so a caller can fall back to its generic wording.
 */
export function refusalReason(error: unknown): { reason: string; body: Record<string, unknown> } | undefined {
    const res = (error as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const message = res?.data?.message;
    if (res?.status !== 422 || typeof message !== 'string') return undefined;
    return { reason: message, body: res.data ?? {} };
}
