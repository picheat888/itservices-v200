/**
 * Helpers for reading Laravel API error responses on the client.
 */
import { translate } from '@/lang';
import { isServerFailure, markShownInline, requestIdOf } from '@/shared/lib/http-errors';
import { formatNumber } from '@/shared/lib/number';
import { useToastStore } from '@/stores/toast';
import { useUiStore } from '@/stores/ui';

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

/** A 5xx in words, with its reference for IT; the server's own text may be a stack trace. */
export function serverFailureText(error: unknown): string {
    const lang = useUiStore.getState().lang;
    const reference = requestIdOf(error);
    const text = translate(lang, 'err_action_server');
    return reference ? `${text} ${translate(lang, 'err_reference').replace('{id}', reference)}` : text;
}

/** The server's own `message` on a failed request, if it sent one; a 5xx gets the standard words and no toast repeats it. */
export function serverMessage(error: unknown): string | undefined {
    if (isServerFailure(error)) {
        markShownInline(error);
        return serverFailureText(error);
    }
    const message = (error as ApiErrorShape)?.response?.data?.message;
    return typeof message === 'string' && message !== '' ? message : undefined;
}

/**
 * Show the standard toast for a failed master-data delete. A 409 means the item
 * is still referenced — the body shows the {count} of records still using it;
 * anything else falls back to a generic error toast.
 */
export function toastDeleteError(error: unknown, t: (key: string) => string, bodyKey = 'md_in_use', titleKey = 'md_in_use_title'): void {
    const res = (error as { response?: { status?: number; data?: { count?: number } } })?.response;
    if (res?.status === 409) {
        useToastStore
            .getState()
            .push(t(bodyKey).replace('{count}', formatNumber(res.data?.count ?? 0, useUiStore.getState().lang)), 'error', t(titleKey));
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

/**
 * The sentence for a refused action, in the reader's language.
 *
 * Endpoints that refuse with a short reason in `message` ('not_open_for_taking',
 * 'not_enough_stock') are worded by the lang key `<prefix><reason>`, with every {name} in it
 * filled from the same-named field of the response (the figures the reason quotes). Anything
 * else — a reason with no sentence yet, a plain validation failure, a dropped connection —
 * falls back to `<prefix>forbidden` (403), `<prefix>invalid` (422) or `<prefix>failed`, so a
 * dialog always has something to say instead of failing silently.
 *
 * `format` turns a quoted value into words when a raw value would not do (a status key into
 * its label, say); by default it is shown as it came.
 */
export function refusalText(
    error: unknown,
    t: (key: string) => string,
    prefix: string,
    format: (name: string, value: unknown) => string = (_name, value) => String(value ?? ''),
): string {
    const res = (error as { response?: { status?: number; data?: Record<string, unknown> } })?.response;
    const body = res?.data ?? {};
    const reason = typeof body.message === 'string' && /^[a-z0-9_]+$/.test(body.message) ? body.message : '';
    const key = `${prefix}${reason}`;
    if (reason && t(key) !== key) {
        return t(key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in body ? format(name, body[name]) : whole));
    }
    const fallback = res?.status === 403 ? 'forbidden' : res?.status === 422 ? 'invalid' : 'failed';
    return t(`${prefix}${fallback}`);
}
