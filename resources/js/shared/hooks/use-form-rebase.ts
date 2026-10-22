// An open edit form takes fresh server values only for the fields the user has not touched; `base` follows the server.
import { nextBase, rebaseLinked, sameValue, type FormDrop, type FormLink } from '@/shared/lib/form-rebase';
import { useEffect, useRef } from 'react';

/** Keep `base` in state, seed `form` and `base` together once per open, and compute dirty as `!sameValue(form, base)`. */
export function useFormRebase<T extends object>(o: {
    fresh: T | null;
    base: T;
    setBase: (next: T) => void;
    setForm: (update: (prev: T) => T) => void;
    skip?: readonly (keyof T)[];
    /** Parent and child selects (see rebaseLinked). */
    links?: readonly FormLink<T>[];
    /** Called after the commit that took a chosen child out. */
    onDrop?: (drops: FormDrop<T>[]) => void;
}): void {
    // Filled inside the form updater (it sees the latest form), read after the commit
    const dropped = useRef<FormDrop<T>[] | null>(null);
    const freshKey = o.fresh === null ? null : JSON.stringify(o.fresh);
    useEffect(() => {
        const { fresh, base, skip, links } = o;
        if (fresh === null || sameValue(nextBase(base, fresh, skip), base)) {
            return;
        }
        o.setForm((prev) => {
            const result = rebaseLinked(base, prev, fresh, skip, links);
            if (result.drops.length > 0) {
                dropped.current = result.drops;
            }
            return result.form;
        });
        o.setBase(nextBase(base, fresh, skip));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freshKey]);

    useEffect(() => {
        if (dropped.current === null) {
            return;
        }
        const drops = dropped.current;
        dropped.current = null;
        o.onDrop?.(drops);
    });
}
