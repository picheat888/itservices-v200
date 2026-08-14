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
    private const CELL = 'padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:14px;';

    private const HEAD = 'padding:8px 10px;border-bottom:2px solid #cbd5e1;font-size:12px;color:#64748b;';

    /**
     * @param  list<string>  $headers
     * @param  list<list<string>>  $rows  cell HTML, in the same order as the headers
     * @param  list<int>  $rightAligned  column indexes that hold numbers
     */
    public static function render(array $headers, array $rows, array $rightAligned = []): string
    {
        $head = '';
        foreach ($headers as $i => $header) {
            $align = in_array($i, $rightAligned, true) ? 'text-align:right;' : 'text-align:left;';
            $head .= '<th style="'.self::HEAD.$align.'">'.$header.'</th>';
        }

        $body = '';
        foreach ($rows as $row) {
            $body .= '<tr>';
            foreach ($row as $i => $cell) {
                $align = in_array($i, $rightAligned, true) ? 'text-align:right;white-space:nowrap;font-weight:600;' : '';
                $body .= '<td style="'.self::CELL.$align.'">'.$cell.'</td>';
            }
            $body .= '</tr>';
        }

        return '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0;">'
            .'<thead><tr>'.$head.'</tr></thead>'
            .'<tbody>'.$body.'</tbody>'
            .'</table>';
    }

    /** A reference cell: the record number, linked to where it can be acted on. */
    public static function link(string $url, string $label): string
    {
        return '<a href="'.e($url).'" style="color:#2563eb;font-weight:600;text-decoration:none;">'.e($label).'</a>';
    }
}
