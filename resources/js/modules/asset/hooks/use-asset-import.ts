// Mutations and template download for the asset import dialog. A finished import pins the new rows and refreshes the asset screens.
import { SIDEBAR_BADGES_KEY } from '@/shared/hooks/use-sidebar-badges';
import { downloadBlob } from '@/shared/lib/utils';
import { markNew } from '@/stores/new-rows';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { assetImportApi, IMPORT_TEMPLATE_FILES, type ImportKind, type ImportRunPayload } from '../api/assetImportApi';

/** How many imported rows get the new-row pin: each one outside the page is fetched on its own, so a 500-row import must not pin them all. */
const PIN_LIMIT = 20;

export function useAssetImport() {
    const qc = useQueryClient();

    const preview = useMutation({
        mutationFn: ({ kind, file }: { kind: ImportKind; file: File }) => assetImportApi.preview(kind, file),
    });

    const run = useMutation({
        mutationFn: (payload: ImportRunPayload) => assetImportApi.run(payload),
        onSuccess: (result) => {
            markNew('assets', [...result.ids].sort((a, b) => b - a).slice(0, PIN_LIMIT));
            return Promise.all([
                qc.invalidateQueries({ queryKey: ['assets'] }),
                qc.invalidateQueries({ queryKey: ['assets-list'] }),
                qc.invalidateQueries({ queryKey: ['assets-summary'] }),
                qc.invalidateQueries({ queryKey: ['dashboard-summary'] }),
                qc.invalidateQueries({ queryKey: SIDEBAR_BADGES_KEY }),
            ]);
        },
    });

    const downloadTemplate = async (kind: ImportKind) => {
        downloadBlob(await assetImportApi.template(kind), IMPORT_TEMPLATE_FILES[kind]);
    };

    return { preview, run, downloadTemplate };
}
