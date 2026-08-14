<?php

namespace App\Support;

/**
 * Renders the table that digest emails are built around.
 *
 * Mail clients drop <style> blocks, so every rule has to ride on the element itself — which
 * is why this exists rather than each digest hand-writing the same inline styles and drifting
 * apart from the others.
 *
 * Cells are emitted as given: a caller that puts text in a cell escapes it first, and one
 * that wants a link passes the anchor. Nothing here guesses which it received.
 */
class EmailTable
{
    private const CELL = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;vertical-align:top;';

    private const HEAD = 'padding:8px 10px;border-bottom:2px solid #cbd5e1;font-size:12px;color:#64748b;white-space:nowrap;';

    /**
     * @param  list<string>  $headers
     * @param  list<list<string>>  $rows  cell HTML, in the same order as the headers
     * @param  list<int>  $rightAligned  column indexes that hold numbers
     * @param  list<string>  $widths  optional per-column widths ('15%'); two tables given the
     *                                same widths line up under each other, which is the whole
     *                                point when a mail carries more than one of them
     */
    public static function render(array $headers, array $rows, array $rightAligned = [], array $widths = []): string
    {
        $cols = '';
        foreach ($widths as $width) {
            $cols .= '<col style="width:'.$width.';">';
        }

        $head = '';
        foreach ($headers as $i => $header) {
            $align = in_array($i, $rightAligned, true) ? 'text-align:right;' : 'text-align:left;';
            $head .= '<th style="'.self::HEAD.$align.'">'.$header.'</th>';
        }

        $body = '';
        foreach ($rows as $row) {
            $body .= '<tr>';
            foreach ($row as $i => $cell) {
                // Numbers keep to one line and read as figures; the reference in the first
                // column keeps to one line too, because a record number split across two
                // lines stops looking like a record number.
                $extra = match (true) {
                    in_array($i, $rightAligned, true) => 'text-align:right;white-space:nowrap;font-weight:600;',
                    $i === 0 => 'white-space:nowrap;',
                    default => '',
                };
                $body .= '<td style="'.self::CELL.$extra.'">'.$cell.'</td>';
            }
            $body .= '</tr>';
        }

        return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0;">'
            .($cols !== '' ? '<colgroup>'.$cols.'</colgroup>' : '')
            .'<thead><tr>'.$head.'</tr></thead>'
            .'<tbody>'.$body.'</tbody>'
            .'</table>';
    }

    /**
     * A text cell: escaped, and clipped so one long value cannot turn a row into a paragraph.
     *
     * The clipping happens here rather than in CSS because `text-overflow: ellipsis` does not
     * survive Outlook, which renders with the Word engine — a table that relies on it looks
     * right everywhere except the client most of the office reads mail in.
     */
    public static function text(string $value, int $limit = 60): string
    {
        $value = trim($value);

        return e(mb_strlen($value) > $limit ? mb_substr($value, 0, $limit - 1).'…' : $value);
    }

    /** A reference cell: the record number, linked to where it can be acted on. */
    public static function link(string $url, string $label): string
    {
        return '<a href="'.e($url).'" style="color:#2563eb;font-weight:600;text-decoration:none;">'.e($label).'</a>';
    }
}
