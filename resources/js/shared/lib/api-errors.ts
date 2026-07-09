/**
 * Helpers for reading Laravel API error responses on the client.
 */

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
