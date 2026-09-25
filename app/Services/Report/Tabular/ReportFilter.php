<?php

namespace App\Services\Report\Tabular;

/**
 * One filter of a tabular report (Report Center → "table" reports): what the page draws,
 * how the request validates it, and its default when the reader leaves it empty.
 */
final class ReportFilter
{
    /**
     * @param  list<array{value: string|int, label?: string, label_th?: ?string, label_key?: string}>  $options
     */
    private function __construct(
        public readonly string $name,
        public readonly string $type,
        public readonly array $options = [],
        public readonly string|int|null $default = null,
    ) {}

    /**
     * A dropdown. Each option labels itself with an i18n key (`label_key`) or, for master
     * data, with `label` / `label_th` straight from the database.
     *
     * @param  list<array{value: string|int, label?: string, label_th?: ?string, label_key?: string}>  $options
     */
    public static function select(string $name, array $options, string|int|null $default = null): self
    {
        return new self($name, 'select', $options, $default);
    }

    public static function date(string $name, ?string $default = null): self
    {
        return new self($name, 'date', [], $default);
    }

    public static function search(string $name = 'search'): self
    {
        return new self($name, 'search');
    }

    /**
     * @return list<mixed>
     */
    public function rules(): array
    {
        return match ($this->type) {
            'select' => ['nullable', 'in:'.implode(',', array_column($this->options, 'value'))],
            'date' => ['nullable', 'date_format:Y-m-d'],
            default => ['nullable', 'string', 'max:100'],
        };
    }

    /**
     * @return array{name: string, type: string, options: list<array<string, mixed>>, default: string|int|null, label_key: string}
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'type' => $this->type,
            'options' => $this->options,
            'default' => $this->default,
            'label_key' => "rep_fl_{$this->name}",
        ];
    }
}
