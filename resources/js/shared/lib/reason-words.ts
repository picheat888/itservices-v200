// A refusal code the server sent, worded by the lang key `<prefix><code>` with its {name} figures filled from the response.

const CODE = /^[a-z0-9_]+$/;

type Body = Record<string, unknown> & { message?: unknown; errors?: Record<string, unknown> };

/** Codes a failed response carries: its `message`, then the first message of each field error. */
function reasonCodes(body: Body): string[] {
    const fieldFirsts = Object.values(body.errors ?? {}).map((messages) => (Array.isArray(messages) ? messages[0] : undefined));
    return [body.message, ...fieldFirsts].filter((code): code is string => typeof code === 'string' && CODE.test(code));
}

/** The words for the first code that has a lang key, or undefined so the caller keeps its own fallback. */
export function reasonWords(
    error: unknown,
    t: (key: string) => string,
    prefix: string,
    format: (name: string, value: unknown) => string = (_name, value) => String(value ?? ''),
): string | undefined {
    const body = ((error as { response?: { data?: unknown } })?.response?.data ?? {}) as Body;
    const key = reasonCodes(body)
        .map((code) => `${prefix}${code}`)
        .find((candidate) => t(candidate) !== candidate);
    return key === undefined ? undefined : t(key).replace(/\{(\w+)\}/g, (whole, name: string) => (name in body ? format(name, body[name]) : whole));
}
