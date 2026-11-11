<?php

// dompdf output for Thai: marks drawn with the Sarabun PDF glyph variants, and copied text maps back to plain Thai.

namespace Tests\Feature;

use App\Support\Pdf\ThaiPdfCanvas;
use App\Support\PdfFooter;
use Barryvdh\DomPDF\Facade\Pdf;
use PHPUnit\Framework\Attributes\RunInSeparateProcess;
use Tests\TestCase;

class ThaiPdfTextTest extends TestCase
{
    private function render(string $body, bool $withFooter = false): string
    {
        $regular = storage_path('fonts/SarabunPdf-Regular.ttf');
        $html = '<html><head><meta charset="utf-8"><style>'
            ."@font-face { font-family: 'Sarabun'; font-weight: normal; src: url(\"{$regular}\") format('truetype'); }"
            ."* { font-family: 'Sarabun', sans-serif; }"
            .'</style></head><body>'.$body.'</body></html>';

        $pdf = Pdf::loadHTML($html);
        if ($withFooter) {
            PdfFooter::stamp($pdf, 'App', '', 'หน้า {PAGE_NUM} / {PAGE_COUNT}');
        }
        $this->assertInstanceOf(ThaiPdfCanvas::class, $pdf->getDomPDF()->getCanvas());

        return $pdf->output(['compress' => 0]);
    }

    private function drawn(string $text): string
    {
        return mb_convert_encoding($text, 'UTF-16BE', 'UTF-8');
    }

    #[RunInSeparateProcess]
    public function test_the_canvas_class_loads_only_when_a_pdf_is_built(): void
    {
        $this->assertFalse(class_exists(ThaiPdfCanvas::class, false));

        $pdf = Pdf::loadHTML('<p>x</p>');

        $this->assertTrue(class_exists(ThaiPdfCanvas::class, false));
        $this->assertInstanceOf(ThaiPdfCanvas::class, $pdf->getDomPDF()->getCanvas());
    }

    public function test_body_text_is_drawn_with_the_shaped_marks(): void
    {
        $pdf = $this->render('<p>ค่า ปี่</p>');

        $this->assertStringContainsString($this->drawn("ค\u{F70A}า"), $pdf);
        $this->assertStringContainsString($this->drawn("ป\u{F702}\u{F713}"), $pdf);
        $this->assertStringNotContainsString($this->drawn('ค่า'), $pdf);
    }

    public function test_footer_text_is_shaped_too(): void
    {
        $pdf = $this->render('<p>x</p>', withFooter: true);

        $this->assertStringContainsString($this->drawn("หน\u{F70B}า"), $pdf);
    }

    public function test_copied_text_maps_the_pua_codes_back_to_thai(): void
    {
        $pdf = $this->render('<p>ค่า</p>');

        $this->assertStringContainsString('<F70A> <0E48>', $pdf);
        $this->assertStringContainsString('<F700> <0E10>', $pdf);
        $this->assertStringNotContainsString('<0000> <FFFF> <0000>', $pdf);
    }

    public function test_copied_text_ranges_stay_within_one_high_byte(): void
    {
        $pdf = $this->render('<p>ค่า</p>');

        preg_match_all('/(\d+) beginbfrange\n(.*?)\nendbfrange/s', $pdf, $blocks, PREG_SET_ORDER);
        $this->assertNotEmpty($blocks);
        foreach ($blocks as [, $count, $body]) {
            $lines = explode("\n", $body);
            $this->assertCount((int) $count, $lines);
            $this->assertLessThanOrEqual(100, count($lines));
            foreach ($lines as $line) {
                $this->assertMatchesRegularExpression('/^<([0-9A-F]{2})[0-9A-F]{2}> <\1[0-9A-F]{2}> <[0-9A-F]{4}>$/', $line);
            }
        }
        $this->assertStringContainsString('<0E00> <0EFF> <0E00>', $pdf);
        $this->assertStringContainsString('<F71B> <F7FF> <F71B>', $pdf);
    }

    public function test_fonts_without_the_pua_glyphs_get_plain_text(): void
    {
        $pdf = $this->render('<p style="font-family: DejaVu Sans">ค่า</p>');

        $this->assertStringContainsString($this->drawn('ค่า'), $pdf);
    }

    public function test_fonts_without_the_pua_glyphs_keep_dompdfs_copy_map(): void
    {
        $pdf = $this->render('<p>ค่า</p><p style="font-family: DejaVu Sans">ค่า</p>');

        $this->assertStringContainsString('<F70A> <0E48>', $pdf);
        $this->assertSame(1, substr_count($pdf, '<0000> <FFFF> <0000>'));
    }

    public function test_dompdfs_document_info_is_kept(): void
    {
        $pdf = $this->render('<p>ค่า</p>');

        $this->assertStringContainsString("/Producer (\xFE\xFF".$this->drawn('dompdf '), $pdf);
        $this->assertStringContainsString($this->drawn(' + CPDF').')', $pdf);
        $this->assertMatchesRegularExpression("/\/CreationDate \(D:\d{14}[+-]\d{2}'\d{2}'\)/", $pdf);
    }
}
