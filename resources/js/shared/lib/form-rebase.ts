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

/** A child field whose options belong to a parent field (section in department, model in brand), and the child's empty value. */
export type FormLink<T> = { readonly child: keyof T; readonly parent: keyof T; readonly empty: T[keyof T] };

/** A chosen child a rebase took out because the server moved its parent. */
export type FormDrop<T> = { child: keyof T; value: T[keyof T]; parentValue: T[keyof T] };

/** rebaseForm for linked pairs: a child stays with a parent the user changed, and a child the user chose is emptied (and reported) when the server moves its parent. */
export function rebaseLinked<T extends object>(
    base: T,
    form: T,
    fresh: T,
    skip: readonly (keyof T)[] = [],
    links: readonly FormLink<T>[] = [],
): { form: T; drops: FormDrop<T>[] } {
    const next = rebaseForm(base, form, fresh, skip);
    const drops: FormDrop<T>[] = [];
    for (const { child, parent, empty } of links) {
        const parentTouched = !sameValue(form[parent], base[parent]);
        const childTouched = !sameValue(form[child], base[child]);
        if (parentTouched) {
            next[child] = form[child];
        } else if (!sameValue(next[parent], form[parent]) && childTouched && !sameValue(form[child], empty)) {
            next[child] = empty;
            drops.push({ child, value: form[child], parentValue: next[parent] });
        }
    }
    return { form: next, drops };
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
