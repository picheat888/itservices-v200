import { useEffect, useRef } from 'react';

/**
 * What a detail dialog should render for the record it is currently on.
 *
 * Detail dialogs keep a copy of the last record so their content does not blank
 * out while Radix plays the exit animation (the dialog unmounts the moment its
 * prop goes null, and Radix then skips the fade). That copy is only ever correct
 * for the record it was taken from, so it is offered back on ONE condition: the
 * dialog is closing. While the dialog is open on an id, the record must belong to
 * that id or the dialog shows nothing and reports that it is switching — a
 * skeleton is honest, one record's data under another record's name is not.
 *
 * The `live.id === id` check also covers a query that hands back the previous
 * key's data (`placeholderData: (prev) => prev`), which reads as "loaded" but is
 * the wrong record.
 *
 * Pure so the rule can be tested away from React.
 *
 * @param id       the record the dialog is open on; null once it is closing
 * @param live     freshly fetched record, if any
 * @param retained the last record this dialog rendered
 */
export function pickRecordView<T extends { id: number }>(
    id: number | null,
    live: T | null | undefined,
    retained: T | null,
): { record: T | null; switching: boolean } {
    // Closing: the retained copy keeps the content on screen through the animation.
    if (id === null) {
        return { record: retained, switching: false };
    }
    if (live && live.id === id) {
        return { record: live, switching: false };
    }

    return { record: null, switching: true };
}

/**
 * Retains the last record for the exit animation without ever showing it under a
 * different id. Returns the record to render plus `switching` — true while the
 * dialog is open on an id whose data has not arrived, which is the caller's cue
 * to render a skeleton instead of stale content or an empty state.
 *
 * ```tsx
 * const { record: request, switching } = useRecordView(requestId, data);
 * ```
 */
export function useRecordView<T extends { id: number }>(id: number | null, live: T | null | undefined): { record: T | null; switching: boolean } {
    const retained = useRef<T | null>(null);
    const view = pickRecordView(id, live, retained.current);

    // Remember what we just rendered, for the exit animation. In an effect rather
    // than during render so a render never writes state as a side effect.
    useEffect(() => {
        if (live && live.id === id) {
            retained.current = live;
        }
    }, [id, live]);

    return view;
}
