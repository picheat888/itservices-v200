/**
 * Mistakes in a template's hand-written HTML, for the editor's warning line.
 *
 * The preview cannot show them: the browser quietly repairs broken HTML before drawing it, so
 * a forgotten </strong> or a line dropped into a <ul> without its <li> looks fine on screen
 * while mail clients each repair it their own way. Any HTML parser repairs the same way, which
 * is why this walks the tags itself instead.
 *
 * Checks three things only:
 * - every opening tag has its closing tag, in the right order;
 * - a list (<ul>/<ol>) holds nothing but <li> items. Plain text and {{variables}} are allowed
 *   there, because a variable may expand to ready-made <li> rows;
 * - every tag is one mail clients draw. Valid HTML5 is not enough: desktop Outlook draws mail
 *   with Word, which ignores <section> and the like, and clients strip <button>, <form>,
 *   <script>, <video>. Each such tag is reported once, at its first use.
 */

/** Where the offending tag is: its 1-based line, and its character range in the text. */
interface TagSpot {
    line: number;
    start: number;
    end: number;
}

/** What is wrong with the tag. */
type HtmlIssueKind =
    /** `<tag>` is never closed. */
    | { kind: 'unclosed'; tag: string }
    /** `</tag>` closes nothing. */
    | { kind: 'stray'; tag: string }
    /** `</tag>` closes it while `inner` (opened on `innerLine`) is still open. */
    | { kind: 'misnested'; tag: string; inner: string; innerLine: number }
    /** `<tag>` sits directly inside a `<parent>` list instead of inside an `<li>`. */
    | { kind: 'list_child'; tag: string; parent: string }
    /** `<tag>`, at its first use, is not one mail clients reliably draw. */
    | { kind: 'unsupported'; tag: string };

export type HtmlIssue = TagSpot & HtmlIssueKind;

/** Tags that never take a closing tag. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const LIST_TAGS = new Set(['ul', 'ol']);

/** Tags every common mail client (Outlook desktop included) draws. */
const EMAIL_SAFE_TAGS = new Set([
    'a',
    'b',
    'blockquote',
    'br',
    'caption',
    'center',
    'code',
    'col',
    'colgroup',
    'dd',
    'div',
    'dl',
    'dt',
    'em',
    'font',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'i',
    'img',
    'li',
    'ol',
    'p',
    'pre',
    's',
    'small',
    'span',
    'strike',
    'strong',
    'sub',
    'sup',
    'table',
    'tbody',
    'td',
    'tfoot',
    'th',
    'thead',
    'tr',
    'u',
    'ul',
]);

const TAG_PATTERN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;

export function findHtmlIssues(html: string): HtmlIssue[] {
    const issues: HtmlIssue[] = [];
    const open: (TagSpot & { tag: string })[] = [];
    const reportedUnsupported = new Set<string>();
    const lineAt = (index: number) => html.slice(0, index).split('\n').length;

    for (const match of html.matchAll(TAG_PATTERN)) {
        const [, slash, rawTag, selfClose] = match;
        if (!rawTag) continue; // a comment
        const tag = rawTag.toLowerCase();
        const start = match.index ?? 0;
        const spot: TagSpot = { line: lineAt(start), start, end: start + match[0].length };

        if (!slash) {
            if (!EMAIL_SAFE_TAGS.has(tag) && !reportedUnsupported.has(tag)) {
                reportedUnsupported.add(tag);
                issues.push({ kind: 'unsupported', tag, ...spot });
            }
            const parent = open[open.length - 1];
            if (parent && LIST_TAGS.has(parent.tag) && tag !== 'li') {
                issues.push({ kind: 'list_child', tag, parent: parent.tag, ...spot });
            }
            if (!VOID_TAGS.has(tag) && !selfClose) open.push({ tag, ...spot });
            continue;
        }

        if (VOID_TAGS.has(tag)) continue; // a harmless </br>
        const at = open.map((o) => o.tag).lastIndexOf(tag);
        if (at === -1) {
            issues.push({ kind: 'stray', tag, ...spot });
            continue;
        }
        // Everything opened after the tag being closed was left open inside it.
        for (const inner of open.splice(at + 1).reverse()) {
            issues.push({ kind: 'misnested', tag, inner: inner.tag, innerLine: inner.line, ...spot });
        }
        open.pop();
    }

    for (const left of open) issues.push({ kind: 'unclosed', ...left });

    return issues.sort((a, b) => a.start - b.start);
}

/**
 * The problem in the W3C HTML validator's own wording (e.g. "Stray end tag </p>."), left
 * untranslated so it reads the same as any HTML tool and can be searched as is. The last
 * kind is not a validator check, so it borrows the same sentence shape.
 */
export function htmlIssueMessage(issue: HtmlIssue): string {
    switch (issue.kind) {
        case 'unclosed':
            return `Unclosed element <${issue.tag}>.`;
        case 'stray':
            return `Stray end tag </${issue.tag}>.`;
        case 'misnested':
            return `End tag </${issue.tag}> seen, but there were open elements (<${issue.inner}> on line ${issue.innerLine}).`;
        case 'list_child':
            return `Element <${issue.tag}> not allowed as child of element <${issue.parent}> in this context.`;
        case 'unsupported':
            return `Element <${issue.tag}> is not supported by some email clients.`;
    }
}
