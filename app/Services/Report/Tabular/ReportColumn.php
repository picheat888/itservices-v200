<?php

namespace App\Services\Report\Tabular;

use Carbon\CarbonInterface;
use Closure;
use Illuminate\Database\Eloquent\Model;

/**
 * One column of a tabular report. `value()` feeds the page (typed, so the page can format
 * it per language), `exportValue()` feeds Excel/PDF (flat, Thai). Both read the row through
 * the same resolver, so the screen and the file can never disagree.
 *
 * `linkTo()` makes the cell open the record on its own module page (`/tickets?view=5`); the
 * page only turns it into a link when the reader may open that module (nav.ts anyOf).
 * `labelKey()` gives the page heading its own i18n key when the shared `rep_c_{key}` reads
 * wrong for this report (a ticket's "ผู้แจ้ง" against a request's "ผู้ขอ").
 * `sheetOnly()` keeps a column to the Excel sheet — data for analysis (a ticket's full description,
 * both of its SLA deadlines) the screen and the PDF have no room for.
 */
final class ReportColumn
{
    /**
     * @param  Closure(Model): mixed  $resolve
     * @param  array<string, string>  $labelKeys  enum value → i18n key (page)
     * @param  array<string, string>  $exportLabels  enum value → Thai label (export)
     */
    private function __construct(
        public readonly string $key,
        public readonly string $heading,
        public readonly string $type,
        private readonly Closure $resolve,
        private readonly array $labelKeys = [],
        private readonly array $exportLabels = [],
    ) {}

    /** Module page the cell links to ("/tickets"). */
    private ?string $linkPath = null;

    /** @var (Closure(Model): (int|null))|null */
    private ?Closure $linkId = null;

    /** The page heading's i18n key when not the shared `rep_c_{key}`. */
    private ?string $labelKey = null;

    /** Whether only the Excel sheet carries this column (not the page, the API rows or the PDF). */
    private bool $sheetOnly = false;

    /** Whether the page's column picker starts with this column hidden (the reader can show it). */
    private bool $hiddenByDefault = false;

    /**
     * Start this column hidden on the page — detail most readers skip (a serial, the warehouse)
     * or a value another cell already draws. The API rows still carry it, the picker can show it,
     * and the Excel sheet always has it (TabularReport::sheetColumns).
     */
    public function hiddenByDefault(): self
    {
        $this->hiddenByDefault = true;

        return $this;
    }

    public function isHiddenByDefault(): bool
    {
        return $this->hiddenByDefault;
    }

    /** Carry this column in the Excel sheet only. */
    public function sheetOnly(): self
    {
        $this->sheetOnly = true;

        return $this;
    }

    public function isSheetOnly(): bool
    {
        return $this->sheetOnly;
    }

    /** Head the column on the page with this i18n key instead of `rep_c_{key}`. */
    public function labelKey(string $key): self
    {
        $this->labelKey = $key;

        return $this;
    }

    /**
     * Link the cell to the record on its module page — `?view={id}` opens its detail there.
     *
     * @param  Closure(Model): (int|null)  $id
     */
    public function linkTo(string $path, Closure $id): self
    {
        $this->linkPath = $path;
        $this->linkId = $id;

        return $this;
    }

    /** The cell's link for this row, or null when it has none (no link declared, or no record). */
    public function link(Model $row): ?string
    {
        if ($this->linkPath === null || $this->linkId === null) {
            return null;
        }
        $id = ($this->linkId)($row);

        return $id === null ? null : "{$this->linkPath}?view={$id}";
    }

    public static function text(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'text', $resolve);
    }

    /** Master data stored in two languages; the resolver returns ['name' => …, 'name_th' => …] or null. */
    public static function localized(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'localized', $resolve);
    }

    public static function number(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'number', $resolve);
    }

    public static function money(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'money', $resolve);
    }

    /** The resolver returns a date/datetime (or null); shown as Y-m-d. */
    public static function date(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'date', $resolve);
    }

    /** The resolver returns a datetime (or null); shown as "Y-m-d H:i" on the page and in the file. */
    public static function dateTime(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'datetime', $resolve);
    }

    /** The resolver returns a date (or null); shown as whole days from today (negative = past). */
    public static function daysLeft(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'days_left', $resolve);
    }

    /** The resolver returns hours to a deadline (negative = past it); the page shows it as "เกิน 3 วัน" / "อีก 5 ชม.". */
    public static function hoursLeft(string $key, string $heading, Closure $resolve): self
    {
        return new self($key, $heading, 'hours_left', $resolve);
    }

    /**
     * @param  array<string, string>  $labelKeys
     * @param  array<string, string>  $exportLabels
     */
    public static function enum(string $key, string $heading, Closure $resolve, array $labelKeys, array $exportLabels): self
    {
        return new self($key, $heading, 'enum', $resolve, $labelKeys, $exportLabels);
    }

    public function value(Model $row): mixed
    {
        $raw = ($this->resolve)($row);

        return match ($this->type) {
            'number', 'money', 'hours_left' => $raw === null ? null : (float) $raw,
            'date' => $raw instanceof CarbonInterface ? $raw->format('Y-m-d') : null,
            'datetime' => $raw instanceof CarbonInterface ? $raw->format('Y-m-d H:i') : null,
            'days_left' => $raw instanceof CarbonInterface
                ? (int) now()->startOfDay()->diffInDays($raw->copy()->startOfDay(), false)
                : null,
            'enum' => $raw instanceof \BackedEnum ? $raw->value : $raw,
            default => $raw,
        };
    }

    public function exportValue(Model $row): string|int|float|null
    {
        $value = $this->value($row);

        return match ($this->type) {
            'localized' => is_array($value) ? (($value['name_th'] ?? null) ?: ($value['name'] ?? null)) : null,
            'enum' => $value === null ? null : ($this->exportLabels[$value] ?? (string) $value),
            default => $value,
        };
    }

    /**
     * @return array{key: string, type: string, label_key: string, labels?: array<string, string>, link?: string, hidden?: true}
     */
    public function toArray(): array
    {
        $column = ['key' => $this->key, 'type' => $this->type, 'label_key' => $this->labelKey ?? "rep_c_{$this->key}"];
        if ($this->linkPath !== null) {
            $column['link'] = $this->linkPath;
        }
        if ($this->hiddenByDefault) {
            $column['hidden'] = true;
        }
        if ($this->type === 'enum') {
            $column['labels'] = $this->labelKeys;
        }

        return $column;
    }
}
