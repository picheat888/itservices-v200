<?php

namespace App\Services\Report\Tabular;

/**
 * One filter of a tabular report (Report Center → "table" reports): what the page draws,
 * how the request validates it, and its default when the reader leaves it empty.
 * `labelKey()` gives the filter its own i18n key when the shared `rep_fl_{name}` reads wrong
 * for this report (an asset's "หมวดหมู่" against a ticket's "หมวด").
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

    /** The label's i18n key when not the shared `rep_fl_{name}`. */
    private ?string $labelKey = null;

    /** Label the filter on the page with this i18n key instead of `rep_fl_{name}`. */
    public function labelKey(string $key): self
    {
        $this->labelKey = $key;

        return $this;
    }

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
            'label_key' => $this->labelKey ?? "rep_fl_{$this->name}",
        ];
    }
}
