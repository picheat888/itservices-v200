<?php

namespace App\Services\Report\Tabular;

/**
 * One headline number above a tabular report's table (and on the export's summary sheet).
 * `tone` is a UI hint: null | 'amber' | 'red' | 'green'. `format` tells the page (and the
 * PDF) how to render the value: 'count' (default, a plain integer) or 'money' (2 decimals,
 * locale grouping — mirrors TabularCell's money column formatting). `split` optionally breaks
 * the value down for the tile's footer ("ซื้อ 62 · เช่า 18"): each part a key, an i18n label key
 * and its count. Screen only.
 */
final class ReportSummary
{
    private function __construct(
        public readonly string $key,
        public readonly string $heading,
        public readonly int|float|null $value,
        public readonly ?string $tone,
        public readonly string $format = 'count',
        /** @var list<array{key: string, label_key: string, value: int}> */
        public readonly array $split = [],
    ) {}

    public static function make(string $key, string $heading, int|float|null $value, ?string $tone = null, string $format = 'count'): self
    {
        return new self($key, $heading, $value, $tone, $format);
    }

    /**
     * The same tile with a breakdown for its footer.
     *
     * @param  list<array{key: string, label_key: string, value: int}>  $split
     */
    public function withSplit(array $split): self
    {
        return new self($this->key, $this->heading, $this->value, $this->tone, $this->format, $split);
    }

    /**
     * @return array{key: string, label_key: string, heading: string, value: int|float|null, tone: ?string, format: string, split: list<array{key: string, label_key: string, value: int}>}
     */
    public function toArray(): array
    {
        return ['key' => $this->key, 'label_key' => "rep_k_{$this->key}", 'heading' => $this->heading, 'value' => $this->value, 'tone' => $this->tone, 'format' => $this->format, 'split' => $this->split];
    }
}
