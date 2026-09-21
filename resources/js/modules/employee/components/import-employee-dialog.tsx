import { useT } from '@/lang';
import { ImportDialog } from '@/shared/components/import-dialog';
import { employeeApi, type ImportPreviewRow } from '../api/employeeApi';
import { useEmployeeMutations } from '../hooks/use-employees';
import { ImportAccountNotice, ImportEmployeeGuide } from './import-guide';
import { ImportPreviewTable } from './import-preview-table';

/**
 * Bulk-import employees from a CSV. The shared ImportDialog does the file handling;
 * what belongs to this module is the wording, the two endpoints, and the dry-run
 * table that shows which department / section / position / manager each row resolved
 * to before anything is written.
 */
export function ImportEmployeeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const t = useT();
    const { import: importMut, previewImport: previewMut } = useEmployeeMutations();

    return (
        <ImportDialog<ImportPreviewRow>
            open={open}
            onClose={onClose}
            title={t('import_employee')}
            description={t('import_desc')}
            hint={t('import_hint')}
            templateFileName="employee-import-template.csv"
            downloadTemplate={employeeApi.downloadImportTemplate}
            // The spellings for department / section / position, to keep open in Excel
            // beside the template — the dialog is closed while the sheet is filled in.
            extraDownloads={[
                {
                    label: t('import_download_values'),
                    fileName: 'employee-valid-values.csv',
                    fetch: employeeApi.downloadImportReference,
                },
            ]}
            notice={<ImportAccountNotice />}
            guide={<ImportEmployeeGuide />}
            runImport={(file) => importMut.mutateAsync(file)}
            importPending={importMut.isPending}
            successMessage={(n) => t('import_success_count').replace('{n}', String(n))}
            preview={{
                run: (file) => previewMut.mutateAsync(file),
                pending: previewMut.isPending,
                render: (rows) => <ImportPreviewTable rows={rows} />,
            }}
        />
    );
}
