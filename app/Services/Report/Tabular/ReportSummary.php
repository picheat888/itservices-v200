<?php

namespace App\Services\Report\Tabular;

/**
 * One headline number above a tabular report's table (and on the export's summary sheet).
 * `tone` is a UI hint: null | 'amber' | 'red' | 'green' | 'violet' | 'blue' (amber/red also mark
 * the tile as needing attention). `format` tells the page (and the
 * PDF) how to render the value: 'count' (default, a plain integer), 'money' (2 decimals,
 * locale grouping — mirrors TabularCell's money column formatting), 'percent' (a whole percent,
 * "93 %") or 'hours' (one decimal, "58.8 ชม."). `goal` (percent tiles) draws the value as a meter
 * with the goal marked, and flags the tile once the value falls short of it. `split` optionally breaks
 * the value down for the tile's footer ("ซื้อ 62 · เช่า 18"): each part a key, an i18n label key,
 * a chart tone and its count. `share` is the value as a percent of the report's whole, drawn as
 * a badge and a meter in the tile's tone. `note` is one line for the tile's foot when it has no
 * split — an i18n key plus a duration in hours ({n}) and/or a moment "Y-m-d H:i" ({at}) the
 * page formats ("เกินนานสุด 38 วัน", "ใบถัดไปครบ 2 ต.ค. 17:00"), and any plain numbers under
 * `values` filled in by name ({met} → "13 จาก 13 เคส"). All of these are screen only.
 */
final class ReportSummary
{
    private function __construct(
        public readonly string $key,
        public readonly string $heading,
        public readonly int|float|null $value,
        public readonly ?string $tone,
        public readonly string $format = 'count',
        /** @var list<array{key: string, label_key: string, tone: string, value: int}> */
        public readonly array $split = [],
        public readonly ?int $share = null,
        /** @var array{label_key: string, hours?: ?float, at?: ?string, values?: array<string, int|float>}|null */
        public readonly ?array $note = null,
        public readonly ?int $goal = null,
    ) {}

    public static function make(string $key, string $heading, int|float|null $value, ?string $tone = null, string $format = 'count'): self
    {
        return new self($key, $heading, $value, $tone, $format);
    }

    /**
     * The same tile with a breakdown for its footer.
     *
     * @param  list<array{key: string, label_key: string, tone: string, value: int}>  $split
     */
    public function withSplit(array $split): self
    {
        return new self($this->key, $this->heading, $this->value, $this->tone, $this->format, $split, $this->share, $this->note, $this->goal);
    }

    /** The same tile as a share of `$whole` — a whole percent, null when the whole is empty. */
    public function withShareOf(int|float $whole): self
    {
        $share = $whole > 0 && $this->value !== null ? (int) round($this->value / $whole * 100) : null;

        return new self($this->key, $this->heading, $this->value, $this->tone, $this->format, $this->split, $share, $this->note, $this->goal);
    }

    /**
     * The same tile with a line for its foot (see the class note); null leaves it without.
     *
     * @param  array{label_key: string, hours?: ?float, at?: ?string, values?: array<string, int|float>}|null  $note
     */
    public function withNote(?array $note): self
    {
        return new self($this->key, $this->heading, $this->value, $this->tone, $this->format, $this->split, $this->share, $note, $this->goal);
    }

    /** The same percent tile measured against a percent goal (see the class note). */
    public function withGoal(int $goal): self
    {
        return new self($this->key, $this->heading, $this->value, $this->tone, $this->format, $this->split, $this->share, $this->note, $goal);
    }

    /**
     * @return array{key: string, label_key: string, heading: string, value: int|float|null, tone: ?string, format: string, split: list<array{key: string, label_key: string, tone: string, value: int}>, share: ?int, note: array{label_key: string, hours?: ?float, at?: ?string, values?: array<string, int|float>}|null, goal: ?int}
     */
    public function toArray(): array
    {
        return [
            'key' => $this->key, 'label_key' => "rep_k_{$this->key}", 'heading' => $this->heading, 'value' => $this->value,
            'tone' => $this->tone, 'format' => $this->format, 'split' => $this->split, 'share' => $this->share, 'note' => $this->note,
            'goal' => $this->goal,
        ];
    }
}
