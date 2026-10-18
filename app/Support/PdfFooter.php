<?php

// Stamps a footer (app name, printed by/at, page x / y) on every page of a rendered dompdf document.

namespace App\Support;

use Barryvdh\DomPDF\PDF;

class PdfFooter
{
    /**
     * Must run after render(): the canvas text is drawn onto the pages that exist. Works with
     * dompdf's PHP execution switched off, unlike an inline `<script type="text/php">`.
     */
    public static function stamp(PDF $pdf, string $left, string $middle, string $pageLabel = 'Page {PAGE_NUM} / {PAGE_COUNT}'): void
    {
        $pdf->render();
        $dompdf = $pdf->getDomPDF();

        $canvas = $dompdf->getCanvas();
        $metrics = $dompdf->getFontMetrics();
        $font = $metrics->getFont('Sarabun') ?? $metrics->getFont('sans-serif');
        $size = 8;
        $grey = [0.33, 0.36, 0.41];
        $width = $canvas->get_width();
        $y = $canvas->get_height() - 26;
        $margin = 36;

        $middleWidth = $metrics->getTextWidth($middle, $font, $size);
        $pageWidth = $metrics->getTextWidth(str_replace(['{PAGE_NUM}', '{PAGE_COUNT}'], '000', $pageLabel), $font, $size);

        $canvas->page_line($margin, $y - 4, $width - $margin, $y - 4, [0.8, 0.83, 0.87], 0.5);
        $canvas->page_text($margin, $y, $left, $font, $size, $grey);
        $canvas->page_text(($width - $middleWidth) / 2, $y, $middle, $font, $size, $grey);
        $canvas->page_text($width - $margin - $pageWidth, $y, $pageLabel, $font, $size, $grey);
    }
}
