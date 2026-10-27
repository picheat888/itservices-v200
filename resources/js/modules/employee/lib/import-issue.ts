// One problem on an imported CSV row, worded from the issue code the server sends (lang keys import_err_*).
import type { ImportIssue } from '@/shared/components/import-dialog';

export function importIssueText(issue: ImportIssue, t: (key: string) => string): string {
    const key = `import_err_${issue.code}`;
    if (t(key) === key) return `${issue.column}: ${issue.code}`;
    const words = t(key).replace(/\{(\w+)\}/g, (whole, name: string) => String(issue[name] ?? whole));
    return issue.closest ? words + t('import_err_closest').replace('{closest}', String(issue.closest)) : words;
}
