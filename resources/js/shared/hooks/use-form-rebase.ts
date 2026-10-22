// An open edit form takes fresh server values only for the fields the user has not touched; `base` follows the server.
import { rebaseForm, sameValue } from '@/shared/lib/form-rebase';
import { useEffect } from 'react';

/** Keep `base` in state, seed `form` and `base` together once per open, and compute dirty as `!sameValue(form, base)`. */
export function useFormRebase<T extends Record<string, unknown>>(o: {
    fresh: T | null;
    base: T;
    setBase: (next: T) => void;
    setForm: (update: (prev: T) => T) => void;
    skip?: readonly (keyof T)[];
}): void {
    const freshKey = o.fresh === null ? null : JSON.stringify(o.fresh);
    useEffect(() => {
        const { fresh, base, skip } = o;
        if (fresh === null || sameValue(fresh, base)) {
            return;
        }
        o.setForm((prev) => rebaseForm(base, prev, fresh, skip));
        o.setBase(fresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freshKey]);
}
