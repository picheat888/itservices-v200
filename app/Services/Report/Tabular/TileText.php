<?php

// A summary tile as the PDF prints it: the page's label, the value with its unit, a badge and the one context line the page shows.

namespace App\Services\Report\Tabular;

use App\Support\DateDisplay;

final class TileText
{
    /** Print colours of the tile tones (the page's chart tones, one step darker for paper). */
    private const TONES = [
        'red' => '#dc2626', 'amber' => '#d97706', 'green' => '#059669', 'violet' => '#7c3aed',
        'blue' => '#2563eb', 'orange' => '#ea580c', 'pink' => '#db2777', 'gray' => '#64748b',
    ];

    /**
     * @return array{label: string, value: string, badge: ?string, line: ?string, line_tone: ?string, tone: ?string, alert: bool}
     */
    public static function of(ReportSummary $tile, string $currency = 'THB', ?string $label = null): array
    {
        $tone = $tile->tone === null ? null : self::TONES[preg_replace('/^soft-/', '', $tile->tone)] ?? null;
        [$line, $lineTone] = self::line($tile);

        return [
            'label' => $label ?? self::label($tile),
            'value' => self::value($tile->value, $tile->format, $currency),
            'badge' => $tile->share !== null ? $tile->share.'%' : ($tile->goal !== null ? 'เป้า '.$tile->goal.'%' : null),
            'line' => $line,
            'line_tone' => $lineTone,
            'tone' => $tone,
            // Amber and red tiles (or a tile flagged for attention) carry their colour on the number too.
            'alert' => ($tile->value ?? 0) > 0 && ($tile->attention !== null || in_array(preg_replace('/^soft-/', '', (string) $tile->tone), ['red', 'amber'], true)),
        ];
    }

    /** The page's own label for the tile; the export heading when the page's needs values filled in. */
    private static function label(ReportSummary $tile): string
    {
        $word = ThaiWords::get("rep_k_{$tile->key}");

        return $word !== null && ! str_contains($word, '{') ? $word : $tile->heading;
    }

    public static function value(int|float|null $value, string $format, string $currency = 'THB'): string
    {
        if ($value === null) {
            return '—';
        }

        return match ($format) {
            'money' => number_format($value, 2).' '.($currency === 'THB' ? 'บาท' : $currency),
            'percent' => self::number($value).'%',
            'hours' => number_format($value, 1).' ชม.',
            'years' => number_format($value, 1).' ปี',
            'days' => number_format($value, 1).' วัน',
            default => self::number($value),
        };
    }

    /**
     * The split, else the note (with its trend), as one line and the trend's colour.
     *
     * @return array{0: ?string, 1: ?string}
     */
    private static function line(ReportSummary $tile): array
    {
        if ($tile->split !== []) {
            $parts = array_map(function (array $part) use ($tile) {
                $amount = $tile->format === 'hours' && empty($part['counts'])
                    ? number_format($part['value'], 1).' ชม.'
                    : self::number($part['value']);

                return (ThaiWords::get($part['label_key']) ?? $part['key']).' '.$amount;
            }, $tile->split);

            return [implode(', ', $parts), null];
        }

        if ($tile->note === null) {
            return [null, null];
        }

        $text = self::noteText($tile->note);
        $trend = $tile->note['trend'] ?? null;
        if ($trend === null) {
            return [$text, null];
        }

        // The page's change: "+5 จากต้นช่วง", green when the move is good, red when bad, grey when neither.
        $words = ThaiWords::get($trend['label_key']) ?? '';
        $delta = $trend['values']['delta'] ?? null;
        $change = match (true) {
            $delta === null => $words,
            $trend['direction'] === 'even' => (ThaiWords::get('rep_snap_same') ?? 'เท่าเดิม').' '.$words,
            default => ($trend['direction'] === 'up' ? '+' : '−').number_format((float) $delta, (int) ($trend['decimals'] ?? 0)).' '.$words,
        };
        $lead = $tile->note['label_key'] !== $trend['label_key'] ? $text.' ' : '';
        $goodWhenUp = $trend['up_is_good'] ?? null;
        $tone = $delta === null || $trend['direction'] === 'even' || $goodWhenUp === null
            ? null
            : (($trend['direction'] === 'up') === $goodWhenUp ? '#059669' : '#dc2626');

        return [trim($lead.$change), $tone];
    }

    /** @param array<string, mixed> $note */
    private static function noteText(array $note): string
    {
        $text = ThaiWords::get($note['label_key']) ?? '';
        foreach ($note['texts'] ?? [] as $name => $value) {
            $text = str_replace('{'.$name.'}', is_array($value) ? (($value['name_th'] ?? null) ?: $value['name']) : (string) $value, $text);
        }
        $text = self::fill($text, $note['values'] ?? []);
        if (array_key_exists('hours', $note)) {
            $text = str_replace('{n}', $note['hours'] === null ? '—' : self::duration((float) $note['hours']), $text);
        }

        return str_replace('{at}', ! empty($note['at']) ? DateDisplay::dateTime($note['at']) : '—', $text);
    }

    /** @param array<string, int|float> $values */
    private static function fill(string $text, array $values): string
    {
        foreach ($values as $name => $value) {
            $text = str_replace('{'.$name.'}', self::number($value), $text);
        }

        return $text;
    }

    /** "38 วัน" / "5 ชม." — the page's rule: under a day in hours, else whole days. */
    private static function duration(float $hours): string
    {
        $abs = abs($hours);

        return $abs < 24
            ? str_replace('{n}', (string) max(1, (int) round($abs)), ThaiWords::get('rep_hours_n') ?? '{n} ชม.')
            : str_replace('{n}', number_format((int) round($abs / 24)), ThaiWords::get('rep_days_n') ?? '{n} วัน');
    }

    /** Thousands grouping; a fraction keeps up to three decimals without trailing zeros. */
    public static function number(int|float $value): string
    {
        if ((float) $value === floor((float) $value)) {
            return number_format($value);
        }

        return rtrim(rtrim(number_format($value, 3), '0'), '.');
    }
}
