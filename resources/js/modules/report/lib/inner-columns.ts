// Columns a report page draws inside another column's cell (TabularReportExtras.innerColumns): which of them the PDF prints (pure, node tests).

/**
 * The column keys the PDF prints once the reader has hidden some: the visible ones, less each inner
 * column whose host (`hosts`: inner key → the column whose cell draws it) is hidden — hiding "Email and
 * phone" drops the phone too. An inner column with no host named stays.
 */
export function pdfColumnKeys(visible: string[], hidden: string[], hosts: Record<string, string>): string[] {
    return visible.filter((key) => !(key in hosts && hidden.includes(hosts[key])));
}
