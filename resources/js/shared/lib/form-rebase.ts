// Edit forms meet fresh server data: untouched fields take the new values, typed ones stay, and a form seeds once per record.

/** Equal by value: Object.is for primitives, JSON for arrays and plain objects. */
export function sameValue(a: unknown, b: unknown): boolean {
    if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    return Object.is(a, b);
}

/** Every field still equal to `base` takes `fresh`'s value; fields the user changed, and `skip` keys, keep the form's. */
export function rebaseForm<T extends object>(base: T, form: T, fresh: T, skip: readonly (keyof T)[] = []): T {
    const next = { ...form };
    for (const key of Object.keys(form) as (keyof T)[]) {
        if (skip.includes(key) || !Object.prototype.hasOwnProperty.call(fresh, key)) {
            continue;
        }
        if (sameValue(form[key], base[key])) {
            next[key] = fresh[key];
        }
    }
    return next;
}

/** The base after a rebase: the fresh values, except skipped keys keep the value the form opened with (the form keeps them too). */
export function nextBase<T extends object>(base: T, fresh: T, skip: readonly (keyof T)[] = []): T {
    const next = { ...fresh };
    for (const key of skip) {
        next[key] = base[key];
    }
    return next;
}

/** A form seeds when it opens on a record it has not seeded for; a refresh of the same record never re-seeds it. */
export function needsSeed(seededFor: string | number | null, key: string | number | null): boolean {
    return key !== null && key !== seededFor;
}
