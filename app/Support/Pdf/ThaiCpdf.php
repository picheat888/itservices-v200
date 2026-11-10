<?php

// dompdf's Cpdf with a ToUnicode map that turns ThaiPua's PUA code points back into Thai,
// so text copied or searched in the PDF reads as typed.

namespace App\Support\Pdf;

use Dompdf\Cpdf;

class ThaiCpdf extends Cpdf
{
    private const IDENTITY_RANGE = "1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange";

    /**
     * @param  int  $id
     * @param  string  $action
     * @return string|null
     */
    protected function o_toUnicode($id, $action)
    {
        $object = parent::o_toUnicode($id, $action);
        if ($action !== 'out' || ! str_contains((string) $object, self::IDENTITY_RANGE)) {
            return $object;
        }

        [$head, $rest] = explode("stream\n", $object, 2);
        [$stream, $tail] = explode("\nendstream", $rest, 2);
        $stream = str_replace(self::IDENTITY_RANGE, self::thaiRanges(), $stream);
        $head = preg_replace('/\/Length \d+/', '/Length '.strlen($stream), $head);

        return $head."stream\n".$stream."\nendstream".$tail;
    }

    private static function thaiRanges(): string
    {
        $originals = ThaiPua::originals();
        ksort($originals);
        $first = array_key_first($originals);
        $last = array_key_last($originals);

        $chars = array_map(
            fn (int $pua, int $thai) => sprintf('<%04X> <%04X>', $pua, $thai),
            array_keys($originals),
            $originals,
        );

        return implode("\n", [
            '2 beginbfrange',
            sprintf('<0000> <%04X> <0000>', $first - 1),
            sprintf('<%04X> <FFFF> <%04X>', $last + 1, $last + 1),
            'endbfrange',
            count($chars).' beginbfchar',
            ...$chars,
            'endbfchar',
        ]);
    }
}
