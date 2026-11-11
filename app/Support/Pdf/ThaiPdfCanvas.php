<?php

// dompdf canvas (config dompdf.options.pdf_backend) that draws Thai through ThaiPua when the font carries
// the PUA glyphs (storage/fonts/SarabunPdf-*.ttf), on a ThaiCpdf so copied text stays plain Thai.

namespace App\Support\Pdf;

use Dompdf\Adapter\CPDF;
use Dompdf\Dompdf;

class ThaiPdfCanvas extends CPDF
{
    /** @var array<string, bool> dompdf font path => whether it carries the PUA glyphs */
    private array $thaiFonts = [];

    public function __construct($paper = 'letter', string $orientation = 'portrait', ?Dompdf $dompdf = null)
    {
        parent::__construct($paper, $orientation, $dompdf);
        $this->_pdf = ThaiCpdf::takeOver($this->_pdf);
    }

    public function text($x, $y, $text, $font, $size, $color = [0, 0, 0], $word_space = 0.0, $char_space = 0.0, $angle = 0.0): void
    {
        if ($this->fontHasThaiPuaGlyphs($font)) {
            $text = ThaiPua::shape($text);
        }

        parent::text($x, $y, $text, $font, $size, $color, $word_space, $char_space, $angle);
    }

    private function fontHasThaiPuaGlyphs(string $font): bool
    {
        if (! isset($this->thaiFonts[$font])) {
            $pdf = $this->thaiPdf();
            $pdf->selectFont($font, '', true, $this->_dompdf->getOptions()->getIsFontSubsettingEnabled());
            $this->thaiFonts[$font] = $pdf->hasThaiPuaGlyphs($pdf->currentFont);
        }

        return $this->thaiFonts[$font];
    }

    private function thaiPdf(): ThaiCpdf
    {
        assert($this->_pdf instanceof ThaiCpdf);

        return $this->_pdf;
    }
}
