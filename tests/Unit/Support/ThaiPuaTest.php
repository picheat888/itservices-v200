<?php

// How ThaiPua picks raised, lowered and left-shifted Thai mark glyphs for dompdf (expected glyphs come from HarfBuzz on Sarabun).

namespace Tests\Unit\Support;

use App\Support\Pdf\ThaiPua;
use FontLib\Font;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class ThaiPuaTest extends TestCase
{
    /** @return iterable<string, array{string, string}> */
    public static function shapeCases(): iterable
    {
        // Plain consonants
        yield 'tone with no upper vowel goes down' => ['ค่า', "ค\u{F70A}า"];
        yield 'every tone goes down' => ['ก่ก้ก๊ก๋ก์', "ก\u{F70A}ก\u{F70B}ก\u{F70C}ก\u{F70D}ก\u{F70E}"];
        yield 'tone over an upper vowel stays high' => ['ที่ เรื่อง ตั้ง สิทธิ์', 'ที่ เรื่อง ตั้ง สิทธิ์'];
        yield 'tone after a lower vowel goes down' => ['ผู้ใช้', "ผู\u{F70B}ใช\u{F70B}"];
        yield 'tone before sara am stays high' => ['น้ำ ค่ำ', 'น้ำ ค่ำ'];
        yield 'tone before a typed nikhahit and sara aa stays high' => ["น\u{0E49}\u{0E4D}\u{0E32} ป\u{0E48}\u{0E4D}\u{0E32}", "น\u{0E49}\u{0E4D}\u{0E32} ป\u{0E48}\u{0E4D}\u{0E32}"];
        yield 'mai taikhu and nikhahit stay' => ['ก็ กํ', 'ก็ กํ'];
        yield 'lo chula is not a tall consonant' => ['ฬี่ ฬ่', "ฬี่ ฬ\u{F70A}"];

        // Tall consonants ป ฝ ฟ
        yield 'tone on a tall consonant goes down-left' => ['ป่า', "ป\u{F705}า"];
        yield 'upper vowel and its tone shift left' => ['ปี่ ฝึ่ง ฟื้น ปิ์', "ป\u{F702}\u{F713} ฝ\u{F703}\u{F713}ง ฟ\u{F704}\u{F714}น ป\u{F701}\u{F717}"];
        yield 'mai han-akat, mai taikhu, nikhahit shift left' => ['ปั้ ป็ ปํ', "ป\u{F710}\u{F714} ป\u{F712} ป\u{F711}"];
        yield 'tone after a lower vowel on a tall consonant' => ['ปุ่น', "ปุ\u{F705}น"];

        // Below the line
        yield 'yo ying and tho than drop their tail' => ['ญุ ฐู', "\u{F70F}ุ \u{F700}ู"];
        yield 'lower vowel under do chada and to patak goes down' => ['ฎุ ฏู', "ฎ\u{F718} ฏ\u{F719}"];
        yield 'lowered vowel then tone' => ['ฎุ่', "ฎ\u{F718}\u{F70A}"];

        // Left alone
        yield 'latin and digits' => ['Page 1 / 3', 'Page 1 / 3'];
        yield 'empty' => ['', ''];
        yield 'mark with no consonant' => [' ่', ' ่'];
        yield 'second tone in a cluster' => ['ก่่', "ก\u{F70A}่"];
    }

    #[DataProvider('shapeCases')]
    public function test_shape_picks_the_glyph_sarabun_would(string $text, string $expected): void
    {
        $this->assertSame($expected, ThaiPua::shape($text));
    }

    #[DataProvider('shapeCases')]
    public function test_original_text_comes_back_from_the_pua_codes(string $text): void
    {
        $back = '';
        foreach (mb_str_split(ThaiPua::shape($text)) as $char) {
            $back .= mb_chr(ThaiPua::originals()[mb_ord($char)] ?? mb_ord($char));
        }

        $this->assertSame($text, $back);
    }

    public function test_the_pdf_fonts_carry_every_pua_code(): void
    {
        foreach (['Regular', 'Bold'] as $weight) {
            $font = Font::load(__DIR__."/../../../storage/fonts/SarabunPdf-{$weight}.ttf");
            $font->parse();
            $missing = array_diff(array_keys(ThaiPua::originals()), array_keys($font->getUnicodeCharMap()));
            $font->close();

            $this->assertSame([], array_values($missing), "SarabunPdf-{$weight} lacks PUA glyphs");
        }
    }
}
