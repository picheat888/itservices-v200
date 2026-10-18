<?php

namespace App\Services\Report\Tabular;

use App\Support\DateDisplay;
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

    /** Decimal places a number shows on the page, in the PDF and in Excel (0 = whole numbers). */
    private int $decimals = 0;

    private ?string $meaning = null;

    /** Whether the Excel sheet leaves this column out (a display-only mix such as "1 – 5", split into its own columns there). */
    private bool $screenOnly = false;

    /** Sheet-only column holding the code of this column's master data (the department code beside its name). */
    private ?self $codeColumn = null;

    /** Placeholder the page shows for "nobody"; the sheet leaves the cell empty instead. */
    private const NONE = '—';

    public function decimals(): int
    {
        return $this->decimals;
    }

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

    public static function number(string $key, string $heading, Closure $resolve, int $decimals = 0): self
    {
        $column = new self($key, $heading, 'number', $resolve);
        $column->decimals = $decimals;

        return $column;
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
        $column = new self($key, $heading, 'hours_left', $resolve);
        $column->decimals = 1;

        return $column;
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

    /** The Excel sheet's cell: dates as real Excel dates (sheetFormat() shows them as ISO), "—" as empty, the rest as exportValue(). */
    public function sheetValue(Model $row): string|int|float|null
    {
        if ($this->type === 'date' || $this->type === 'datetime') {
            $raw = ($this->resolve)($row);

            return $raw instanceof CarbonInterface ? CellDate::serial($raw, $this->type === 'datetime') : null;
        }
        $value = $this->exportValue($row);

        return $value === self::NONE ? null : $value;
    }

    /** Keep this column off the Excel sheet. */
    public function screenOnly(): self
    {
        $this->screenOnly = true;

        return $this;
    }

    public function isScreenOnly(): bool
    {
        return $this->screenOnly;
    }

    /**
     * Add a sheet-only code column right after this one, read from the resolver's `code` key
     * (a localized column whose resolver returns ['name' => …, 'name_th' => …, 'code' => …]).
     */
    public function withCode(string $heading, string $meaning): self
    {
        $resolve = $this->resolve;
        $this->codeColumn = self::text("{$this->key}_code", $heading, fn (Model $row) => (($resolve)($row))['code'] ?? null)
            ->sheetOnly()
            ->describe($meaning);

        return $this;
    }

    public function codeColumn(): ?self
    {
        return $this->codeColumn;
    }

    /** The Excel number format of this column's cells, or null for General. */
    public function sheetFormat(): ?string
    {
        return match ($this->type) {
            'money' => '#,##0.00',
            'number', 'days_left', 'hours_left' => $this->decimals > 0 ? '#,##0.'.str_repeat('0', $this->decimals) : '#,##0',
            'date' => CellDate::DATE_FORMAT,
            'datetime' => CellDate::DATETIME_FORMAT,
            default => null,
        };
    }

    /** What the column holds, for the workbook's "คำอธิบายคอลัมน์" sheet. */
    public function describe(string $meaning): self
    {
        $this->meaning = $meaning;

        return $this;
    }

    public function meaning(): ?string
    {
        return $this->meaning;
    }

    /** The column's kind of data in Thai, for the glossary sheet. */
    public function typeLabel(): string
    {
        return match ($this->type) {
            'number' => $this->decimals > 0 ? "ตัวเลข (ทศนิยม {$this->decimals} ตำแหน่ง)" : 'ตัวเลข',
            'money' => 'จำนวนเงิน (บาท)',
            'date' => 'วันที่ (ปี ค.ศ. yyyy-mm-dd)',
            'datetime' => 'วันเวลา (ปี ค.ศ. yyyy-mm-dd hh:mm)',
            'days_left' => 'จำนวนวันนับจากวันที่ส่งออก (ติดลบ = เลยมาแล้ว)',
            'hours_left' => 'จำนวนชั่วโมงถึงกำหนด (ติดลบ = เกินกำหนดแล้ว)',
            'enum' => 'ค่าใดค่าหนึ่งใน: '.implode(', ', array_values(array_unique($this->exportLabels))),
            'localized' => 'ข้อความ (ชื่อภาษาไทย ถ้าไม่มีใช้ชื่ออังกฤษ)',
            default => 'ข้อความ',
        };
    }

    public function exportValue(Model $row): string|int|float|null
    {
        $value = $this->value($row);

        return match ($this->type) {
            'localized' => is_array($value) ? (($value['name_th'] ?? null) ?: ($value['name'] ?? null)) : null,
            'enum' => $value === null ? null : ($this->exportLabels[$value] ?? (string) $value),
            'date' => DateDisplay::cellDate($value),
            'datetime' => DateDisplay::cellDateTime($value),
            default => $value,
        };
    }

    /**
     * @return array{key: string, type: string, label_key: string, labels?: array<string, string>, link?: string, hidden?: true, decimals?: int}
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
        if ($this->type === 'number' && $this->decimals > 0) {
            $column['decimals'] = $this->decimals;
        }
        if ($this->type === 'enum') {
            $column['labels'] = $this->labelKeys;
        }

        return $column;
    }
}
