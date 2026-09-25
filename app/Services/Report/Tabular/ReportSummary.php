<?php

namespace App\Services\Report\Tabular;

/**
 * One headline number above a tabular report's table (and on the export's summary sheet).
 * `tone` is a UI hint: null | 'amber' | 'red' | 'green'. `format` tells the page (and the
 * PDF) how to render the value: 'count' (default, a plain integer) or 'money' (2 decimals,
 * locale grouping — mirrors TabularCell's money column formatting).
 */
final class ReportSummary
{
    private function __construct(
        public readonly string $key,
        public readonly string $heading,
        public readonly int|float|null $value,
        public readonly ?string $tone,
        public readonly string $format = 'count',
    ) {}

    public static function make(string $key, string $heading, int|float|null $value, ?string $tone = null, string $format = 'count'): self
    {
        return new self($key, $heading, $value, $tone, $format);
    }

    /**
     * @return array{key: string, label_key: string, heading: string, value: int|float|null, tone: ?string, format: string}
     */
    public function toArray(): array
    {
        return ['key' => $this->key, 'label_key' => "rep_k_{$this->key}", 'heading' => $this->heading, 'value' => $this->value, 'tone' => $this->tone, 'format' => $this->format];
    }
}
