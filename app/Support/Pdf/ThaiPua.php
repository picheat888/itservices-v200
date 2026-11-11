<?php

// Picks the raised, lowered or left-shifted Thai mark glyph per cluster as Windows PUA code points, since dompdf
// draws text without OpenType shaping. A port of HarfBuzz's Thai PUA fallback (hb-ot-shaper-thai.cc).

namespace App\Support\Pdf;

final class ThaiPua
{
    private const SHIFT_DOWN = 'shift_down';

    private const SHIFT_LEFT = 'shift_left';

    private const SHIFT_DOWN_LEFT = 'shift_down_left';

    private const REMOVE_TAIL = 'remove_tail';

    /** @var array<string, array<int, int>> action => [Thai code point => PUA code point] */
    private const PUA = [
        self::SHIFT_DOWN => [
            0x0E48 => 0xF70A, 0x0E49 => 0xF70B, 0x0E4A => 0xF70C, 0x0E4B => 0xF70D, 0x0E4C => 0xF70E,
            0x0E38 => 0xF718, 0x0E39 => 0xF719, 0x0E3A => 0xF71A,
        ],
        self::SHIFT_DOWN_LEFT => [
            0x0E48 => 0xF705, 0x0E49 => 0xF706, 0x0E4A => 0xF707, 0x0E4B => 0xF708, 0x0E4C => 0xF709,
        ],
        self::SHIFT_LEFT => [
            0x0E48 => 0xF713, 0x0E49 => 0xF714, 0x0E4A => 0xF715, 0x0E4B => 0xF716, 0x0E4C => 0xF717,
            0x0E31 => 0xF710, 0x0E34 => 0xF701, 0x0E35 => 0xF702, 0x0E36 => 0xF703, 0x0E37 => 0xF704,
            0x0E47 => 0xF712, 0x0E4D => 0xF711,
        ],
        self::REMOVE_TAIL => [0x0E0D => 0xF70F, 0x0E10 => 0xF700],
    ];

    /** @var array<string, array<string, array{?string, string}>> state => mark type => [action, next state] */
    private const ABOVE = [
        'T0' => ['above' => [null, 'T3'], 'below' => [null, 'T0'], 'tone' => [self::SHIFT_DOWN, 'T3']],
        'T1' => ['above' => [self::SHIFT_LEFT, 'T2'], 'below' => [null, 'T1'], 'tone' => [self::SHIFT_DOWN_LEFT, 'T2']],
        'T2' => ['above' => [null, 'T3'], 'below' => [null, 'T2'], 'tone' => [self::SHIFT_LEFT, 'T3']],
        'T3' => ['above' => [null, 'T3'], 'below' => [null, 'T3'], 'tone' => [null, 'T3']],
    ];

    /** @var array<string, array<string, array{?string, string}>> state => mark type => [action, next state] */
    private const BELOW = [
        'B0' => ['above' => [null, 'B0'], 'below' => [null, 'B2'], 'tone' => [null, 'B0']],
        'B1' => ['above' => [null, 'B1'], 'below' => [self::REMOVE_TAIL, 'B2'], 'tone' => [null, 'B1']],
        'B2' => ['above' => [null, 'B2'], 'below' => [self::SHIFT_DOWN, 'B2'], 'tone' => [null, 'B2']],
    ];

    /** @var array<string, array{string, string}> consonant type => [above state, below state] */
    private const START = [
        'plain' => ['T0', 'B0'],
        'tall' => ['T1', 'B0'],
        'removable_tail' => ['T0', 'B1'],
        'long_tail' => ['T0', 'B2'],
        'other' => ['T3', 'B2'],
    ];

    public static function shape(string $text): string
    {
        if (! preg_match('/[\x{0E31}-\x{0E4E}]/u', $text)) {
            return $text;
        }

        $chars = mb_str_split($text);
        $base = 0;
        [$above, $below] = self::START['other'];

        foreach (self::shapingOrder($chars) as $i) {
            $char = $chars[$i];
            $mark = self::markType(mb_ord($char));

            if ($mark === null) {
                $base = $i;
                [$above, $below] = self::START[self::consonantType(mb_ord($char))];

                continue;
            }

            [$aboveAction, $above] = self::ABOVE[$above][$mark];
            [$belowAction, $below] = self::BELOW[$below][$mark];
            $action = $aboveAction ?? $belowAction;

            // A tone before ำ stays high over its ring
            if ($mark === 'tone' && ($chars[$i + 1] ?? '') === "\u{0E33}") {
                $action = null;
            }

            if ($action === self::REMOVE_TAIL) {
                $chars[$base] = self::swap($chars[$base], $action);
            } elseif ($action !== null) {
                $chars[$i] = self::swap($char, $action);
            }
        }

        return implode('', $chars);
    }

    /** @return array<int, int> PUA code point => Thai code point */
    public static function originals(): array
    {
        $originals = [];
        foreach (self::PUA as $map) {
            foreach ($map as $thai => $pua) {
                $originals[$pua] = $thai;
            }
        }

        return $originals;
    }

    /**
     * Character indexes in shaping order: a ํ typed after a tone goes first, as HarfBuzz does with the ํ of ำ.
     *
     * @param  list<string>  $chars
     * @return list<int>
     */
    private static function shapingOrder(array $chars): array
    {
        $order = [];
        $count = count($chars);
        for ($i = 0; $i < $count; $i++) {
            if (self::markType(mb_ord($chars[$i])) === 'tone' && ($chars[$i + 1] ?? '') === "\u{0E4D}") {
                array_push($order, $i + 1, $i);
                $i++;

                continue;
            }
            $order[] = $i;
        }

        return $order;
    }

    private static function swap(string $char, string $action): string
    {
        return mb_chr(self::PUA[$action][mb_ord($char)] ?? mb_ord($char));
    }

    private static function markType(int $code): ?string
    {
        return match (true) {
            $code === 0x0E31, $code >= 0x0E34 && $code <= 0x0E37, $code === 0x0E47, $code === 0x0E4D, $code === 0x0E4E => 'above',
            $code >= 0x0E38 && $code <= 0x0E3A => 'below',
            $code >= 0x0E48 && $code <= 0x0E4C => 'tone',
            default => null,
        };
    }

    private static function consonantType(int $code): string
    {
        return match (true) {
            in_array($code, [0x0E1B, 0x0E1D, 0x0E1F], true) => 'tall', // ป ฝ ฟ
            in_array($code, [0x0E0D, 0x0E10], true) => 'removable_tail', // ญ ฐ
            in_array($code, [0x0E0E, 0x0E0F], true) => 'long_tail', // ฎ ฏ
            $code >= 0x0E01 && $code <= 0x0E2E => 'plain',
            default => 'other',
        };
    }
}
