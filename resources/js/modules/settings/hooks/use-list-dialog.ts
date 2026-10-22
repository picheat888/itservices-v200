// Add / edit dialog of a Settings list held in the URL (?add=1, ?edit=<id>): a reload or a link reopens it, Back closes it.
import { usePageDialogs } from '@/shared/hooks/use-page-dialogs';
import { useRefetchOnOpen } from '@/shared/hooks/use-refetch-on-open';
import { toRecordId } from '@/shared/lib/utils';
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const KEYS = ['add', 'edit'] as const;

/** `source` is the list's query: opening an edit asks for it again (five-second rule). */
export function useListDialog<T extends { id: number }>(rows: readonly T[], loaded: boolean, source?: Parameters<typeof useRefetchOnOpen>[1]) {
    const [params] = useSearchParams();
    const dialogs = usePageDialogs();
    const adding = params.get('add') === '1';
    const editId = toRecordId(params.get('edit'));
    const editing = editId === null ? null : (rows.find((row) => row.id === editId) ?? null);
    const missing = loaded && editId !== null && editing === null;
    useRefetchOnOpen(editing !== null, source);

    // A link to a row that no longer exists drops the param once, rather than leaving it in the URL
    const dropped = useRef<number | null>(null);
    useEffect(() => {
        if (!missing || dropped.current === editId) return;
        dropped.current = editId;
        dialogs.close(['edit']);
    }, [missing, editId, dialogs]);

    return {
        open: adding || editing !== null,
        editing,
        add: () => dialogs.open({ add: '1' }),
        edit: (row: T) => dialogs.open({ edit: String(row.id) }),
        close: () => dialogs.close(KEYS),
    };
}
