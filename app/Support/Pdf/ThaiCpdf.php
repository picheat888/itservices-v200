<?php

// dompdf's Cpdf with a ToUnicode map that turns ThaiPua's PUA code points back into Thai,
// so text copied or searched in the PDF reads as typed.

namespace App\Support\Pdf;

use Closure;
use Dompdf\Cpdf;
use ReflectionClass;

class ThaiCpdf extends Cpdf
{
    private const IDENTITY_RANGE = "1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange";

    private const PUA_PROBE = 0xF70A;

    private const MAX_BLOCK_LINES = 100;

    /** Carries on the document dompdf's canvas has just set up (info, PDF/A, first page). */
    public static function takeOver(Cpdf $pdf): self
    {
        $thai = (new ReflectionClass(self::class))->newInstanceWithoutConstructor();
        $copyState = function (Cpdf $from): void {
            foreach (get_object_vars($from) as $name => $value) {
                $this->{$name} = $value;
            }
        };
        Closure::bind($copyState, $thai, Cpdf::class)($pdf);

        return $thai;
    }

    public function hasThaiPuaGlyphs(string $fontFileName): bool
    {
        return isset($this->fonts[$fontFileName]['C'][self::PUA_PROBE]);
    }

    /**
     * @param  int  $id
     * @param  string  $action
     */
    protected function o_toUnicode($id, $action): ?string
    {
        $object = parent::o_toUnicode($id, $action);
        if ($action !== 'out' || ! str_contains((string) $object, self::IDENTITY_RANGE) || ! $this->mapsThaiFont((int) $id)) {
            return $object;
        }

        [$head, $rest] = explode("stream\n", $object, 2);
        [$stream, $tail] = explode("\nendstream", $rest, 2);
        $stream = str_replace(self::IDENTITY_RANGE, self::thaiMap(), $stream);
        $head = preg_replace('/\/Length \d+/', '/Length '.strlen($stream), $head);

        return $head."stream\n".$stream."\nendstream".$tail;
    }

    private function mapsThaiFont(int $toUnicodeId): bool
    {
        foreach ($this->objects as $object) {
            if (($object['t'] ?? null) === 'font' && ($object['info']['toUnicode'] ?? null) === $toUnicodeId) {
                return $this->hasThaiPuaGlyphs($object['info']['fontFileName']);
            }
        }

        return false;
    }

    private static function thaiMap(): string
    {
        $originals = ThaiPua::originals();
        ksort($originals);

        $ranges = array_map(
            fn (array $range) => vsprintf('<%04X> <%04X> <%04X>', [...$range, $range[0]]),
            self::identityRanges(array_keys($originals)),
        );
        $chars = array_map(
            fn (int $pua, int $thai) => sprintf('<%04X> <%04X>', $pua, $thai),
            array_keys($originals),
            $originals,
        );

        return implode("\n", [...self::blocks('bfrange', $ranges), ...self::blocks('bfchar', $chars)]);
    }

    /**
     * Every code from 0000 to FFFF except $skip, as ranges that never cross a high byte (ISO 32000-1 9.10.3).
     *
     * @param  list<int>  $skip  sorted
     * @return list<array{int, int}>
     */
    private static function identityRanges(array $skip): array
    {
        $ranges = [];
        for ($blockStart = 0x0000; $blockStart <= 0xFF00; $blockStart += 0x100) {
            $blockEnd = $blockStart + 0xFF;
            $from = $blockStart;
            foreach ($skip as $code) {
                if ($code < $from || $code > $blockEnd) {
                    continue;
                }
                if ($code > $from) {
                    $ranges[] = [$from, $code - 1];
                }
                $from = $code + 1;
            }
            if ($from <= $blockEnd) {
                $ranges[] = [$from, $blockEnd];
            }
        }

        return $ranges;
    }

    /**
     * @param  list<string>  $lines
     * @return list<string>
     */
    private static function blocks(string $operator, array $lines): array
    {
        $out = [];
        foreach (array_chunk($lines, self::MAX_BLOCK_LINES) as $block) {
            $out[] = count($block).' begin'.$operator;
            array_push($out, ...$block);
            $out[] = 'end'.$operator;
        }

        return $out;
    }
}
