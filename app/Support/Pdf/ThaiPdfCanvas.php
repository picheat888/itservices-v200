<?php

// dompdf canvas (config dompdf.options.pdf_backend) that draws Thai through ThaiPua when the font carries
// the PUA glyphs (storage/fonts/SarabunPdf-*.ttf), on a ThaiCpdf so copied text stays plain Thai.

namespace App\Support\Pdf;

use Dompdf\Adapter\CPDF;
use Dompdf\Dompdf;

class ThaiPdfCanvas extends CPDF
{
    public function __construct($paper = 'letter', string $orientation = 'portrait', ?Dompdf $dompdf = null)
    {
        parent::__construct($paper, $orientation, $dompdf);

        // Same set-up as the parent, on a ThaiCpdf
        $options = $this->_dompdf->getOptions();
        $this->_pdf = new ThaiCpdf([0, 0, $this->_width, $this->_height], true, $options->getFontCache(), $options->getTempDir());
        $this->_pdf->addInfo('Producer', sprintf('%s + CPDF', $this->_dompdf->version));
        $time = substr_replace(date('YmdHisO'), '\'', -2, 0).'\'';
        $this->_pdf->addInfo('CreationDate', "D:$time");
        $this->_pdf->addInfo('ModDate', "D:$time");
        if ($options->isPdfAEnabled()) {
            $this->_pdf->enablePdfACompliance();
        }
        $this->_pages = [$this->_pdf->getFirstPageId()];
    }

    public function text($x, $y, $text, $font, $size, $color = [0, 0, 0], $word_space = 0.0, $char_space = 0.0, $angle = 0.0)
    {
        $this->_pdf->selectFont($font, '', true, $this->_dompdf->getOptions()->getIsFontSubsettingEnabled());
        if ($this->fontHasThaiPuaGlyphs()) {
            $text = ThaiPua::shape($text);
        }

        parent::text($x, $y, $text, $font, $size, $color, $word_space, $char_space, $angle);
    }

    private function fontHasThaiPuaGlyphs(): bool
    {
        return isset($this->_pdf->fonts[$this->_pdf->currentFont]['C'][0xF70A]);
    }
}
