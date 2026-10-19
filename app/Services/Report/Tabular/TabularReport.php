<?php

namespace App\Services\Report\Tabular;

use App\Models\User;
use App\Support\DateDisplay;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * A table-style report of the Report Center, declared once: its filters, its query, its
 * columns and its headline numbers. The engine (TabularReportRequest,
 * TabularReportController, TabularReportExporter and the generic React page) does the rest.
 *
 * Access lives in ReportCatalogue, not here, so the hub and the endpoints read one list.
 */
abstract class TabularReport
{
    /** @var list<string>|null column keys the reader chose to keep; null = every column */
    private ?array $shownColumns = null;

    abstract public function key(): string;

    /** Thai title printed on the Excel/PDF file. */
    abstract public function title(): string;

    /**
     * @return list<ReportFilter>
     */
    abstract public function filters(): array;

    /**
     * The rows, already scoped and ordered. Eager-load everything the columns read.
     *
     * @param  array<string, mixed>  $filters  resolveFilters() output
     */
    abstract public function query(User $viewer, array $filters): Builder;

    /**
     * @return list<ReportColumn>
     */
    abstract public function columns(): array;

    /**
     * Keep only these columns in the file (the page's column picker); null or empty = all.
     *
     * @param  list<string>|null  $keys
     */
    public function showOnly(?array $keys): static
    {
        $this->shownColumns = $keys === null || $keys === [] ? null : array_values($keys);

        return $this;
    }

    /**
     * The columns the page shows (and the API rows carry): all but the sheet-only ones.
     *
     * @return list<ReportColumn>
     */
    public function screenColumns(): array
    {
        return array_values(array_filter($this->columns(), fn (ReportColumn $c) => ! $c->isSheetOnly()));
    }

    /**
     * The columns the PDF prints: the page's columns, or the chosen ones in their report order.
     *
     * @return list<ReportColumn>
     */
    public function exportColumns(): array
    {
        $columns = $this->screenColumns();
        if ($this->shownColumns === null) {
            return $columns;
        }

        return array_values(array_filter($columns, fn (ReportColumn $c) => in_array($c->key, $this->shownColumns, true)));
    }

    /**
     * The columns the Excel sheet carries: every column but the screen-only ones, whatever the page's
     * column picker keeps (the picker shapes the page and the PDF only), in sheetOrder() when the
     * report sets one.
     *
     * @return list<ReportColumn>
     */
    public function sheetColumns(): array
    {
        $columns = array_values(array_filter($this->columns(), fn (ReportColumn $c) => ! $c->isScreenOnly()));

        $order = array_flip($this->sheetOrder());
        if ($order !== []) {
            // Listed keys first, in the listed order; any column the list leaves out keeps its place after them.
            $rank = fn (ReportColumn $c, int $i) => $order[$c->key] ?? count($order) + $i;
            $ranked = array_map(fn (ReportColumn $c, int $i) => [$rank($c, $i), $c], $columns, array_keys($columns));
            usort($ranked, fn (array $a, array $b) => $a[0] <=> $b[0]);
            $columns = array_column($ranked, 1);
        }

        // Each master-data code sits right after its name
        $withCodes = [];
        foreach ($columns as $column) {
            $withCodes[] = $column;
            if ($column->codeColumn() !== null) {
                $withCodes[] = $column->codeColumn();
            }
        }

        if ($this->hasRowId()) {
            $withCodes[] = ReportColumn::number('row_id', 'เลขที่รายการในระบบ', fn (Model $row) => $row->getKey())
                ->describe('เลขอ้างอิงของแถวนี้ในระบบ ไม่ซ้ำกัน ใช้เป็นคีย์ของแถวเมื่อนำไปวิเคราะห์หรือตรวจสอบ');
        }

        return $withCodes;
    }

    /** What a column holds, for the glossary sheet: its own describe(), else the report's meanings(). */
    public function columnMeaning(ReportColumn $column): string
    {
        return $column->meaning() ?? $this->meanings()[$column->key] ?? '';
    }

    /**
     * Column key → what it holds and how it is counted, for the glossary sheet.
     *
     * @return array<string, string>
     */
    protected function meanings(): array
    {
        return [];
    }

    /** Whether the sheet ends with the record id: for rows with no number of their own (a movement, a grant, an approval step). */
    protected function hasRowId(): bool
    {
        return false;
    }

    /** The Excel rows sheet's tab name, the same in every workbook so Power BI finds the table by name. */
    public function sheetTitle(): string
    {
        return 'ข้อมูลดิบ';
    }

    /**
     * The Excel sheet's column order, as column keys — grouped for analysis rather than for the
     * screen. None by default: the sheet keeps the report's own order.
     *
     * @return list<string>
     */
    protected function sheetOrder(): array
    {
        return [];
    }

    /**
     * Headline numbers over the filtered query. Default: the row count.
     *
     * @param  array<string, mixed>  $filters
     * @return list<ReportSummary>
     */
    public function summary(Builder $query, array $filters): array
    {
        return [ReportSummary::make('total', 'ทั้งหมด', (clone $query)->count())];
    }

    /**
     * What the file covers, as [label, value] lines for its summary: the dates first, then every
     * filter that narrows the rows, or one "ไม่ได้กรอง" line when none does.
     *
     * @param  array<string, mixed>  $filters  resolveFilters() output
     * @return list<array{0: string, 1: string}>
     */
    public function scopeLines(array $filters): array
    {
        $isSet = fn (mixed $value) => $value !== null && $value !== '';
        $label = fn (ReportFilter $f) => ThaiWords::get($f->toArray()['label_key']) ?? $f->name;
        $dates = [];
        $narrowing = [];

        foreach ($this->filters() as $filter) {
            $value = $filters[$filter->name] ?? null;
            if ($filter->toArray()['view'] || ! $isSet($value)) {
                continue;
            }
            if ($filter->type === 'date') {
                if (! in_array($filter->name, ['from', 'to'], true)) {
                    $dates[] = [$label($filter), DateDisplay::date($value)];
                }

                continue;
            }
            $narrowing[] = [$label($filter), $this->optionLabel($filter, $value)];
        }

        if ($isSet($filters['from'] ?? null) && $isSet($filters['to'] ?? null)) {
            [$from, $to] = $this->dayRange($filters);
            array_unshift($dates, ['ช่วงวันที่', DateDisplay::range($from, $to)]);
        }

        return [...$dates, ...($narrowing ?: [['ตัวกรอง', 'ไม่ได้กรอง']])];
    }

    /** A filter value as the page's dropdown names it; a search or unknown value as typed. */
    private function optionLabel(ReportFilter $filter, mixed $value): string
    {
        foreach ($filter->options as $option) {
            if ((string) $option['value'] !== (string) $value) {
                continue;
            }
            if (isset($option['label_key'])) {
                return ThaiWords::get($option['label_key']) ?? (string) $value;
            }

            return ($option['label_th'] ?? null) ?: ($option['label'] ?? (string) $value);
        }

        return (string) $value;
    }

    /**
     * A pair of date filters as whole days; a reversed range is read the right way round.
     *
     * @param  array<string, mixed>  $filters
     * @return array{0: Carbon, 1: Carbon}
     */
    protected function dayRange(array $filters, string $fromKey = 'from', string $toKey = 'to'): array
    {
        $from = Carbon::parse($filters[$fromKey])->startOfDay();
        $to = Carbon::parse($filters[$toKey])->endOfDay();

        return $from->lte($to) ? [$from, $to] : [$to->copy()->startOfDay(), $from->copy()->endOfDay()];
    }

    /**
     * Batch-load whatever the columns need beyond the query itself, for the rows about to be
     * shown or exported (a median per row, names looked up by code) — one pass over the
     * set instead of a query per row. Called before any row() / export mapping. Default: nothing.
     *
     * @param  Collection<int, Model>  $rows
     * @param  array<string, mixed>  $filters
     */
    public function hydrateRows(Collection $rows, User $viewer, array $filters): void {}

    public function pdfOrientation(): string
    {
        return 'landscape';
    }

    /**
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        $rules = [];
        foreach ($this->filters() as $filter) {
            $rules[$filter->name] = $filter->rules();
        }

        return $rules;
    }

    /**
     * Validated input with every filter present: the reader's value, else the filter's default.
     *
     * @param  array<string, mixed>  $validated
     * @return array<string, mixed>
     */
    public function resolveFilters(array $validated): array
    {
        $filters = [];
        foreach ($this->filters() as $filter) {
            $value = $validated[$filter->name] ?? null;
            $filters[$filter->name] = ($value === null || $value === '') ? $filter->default : $value;
        }

        return $filters;
    }

    /**
     * Charts drawn above the table, over the same filtered query — none by default. Each entry
     * is a typed array the page draws as it comes (resources/js/modules/report/components/
     * tabular-charts.tsx): 'stacks' (one stacked bar per row), 'donut' (shares of a whole) or
     * 'bars' (one bar per row). Screen only; the file export keeps to the table.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array<string, mixed>>
     */
    public function charts(Builder $query, array $filters): array
    {
        return [];
    }

    /**
     * Extra tables the file export carries between the summary and the rows — each one its own
     * sheet in Excel and its own block in the PDF. For a report whose page draws a breakdown the
     * rows do not (one line per request type above a list of tickets). None by default.
     * `note` (PDF only) says what the table does not follow, in the page's words ("ตามสถานะตอนนี้
     * ไม่ขึ้นกับช่วงวันที่"); `empty` (PDF only) replaces the table with one line when it cannot be drawn.
     * `money` lists the column indexes holding baht: both files add "(บาท)" and show 2 decimals.
     *
     * @param  array<string, mixed>  $filters
     * @return list<array{title: string, headings: list<string>, rows: list<list<string|int|float|null>>, note?: string, empty?: string, money?: list<int>}>
     */
    public function exportSections(User $viewer, array $filters): array
    {
        return [];
    }

    /**
     * What each summary tile counts, by tile key, for the PDF's explanation page — the page's own
     * ⓘ text where it has one. None by default.
     *
     * @return array<string, string>
     */
    public function summaryMeanings(): array
    {
        return [];
    }

    /**
     * How this report counts, as short lines for the PDF's explanation page. Reports add their own
     * rules (an SLA goal, a valuation method) after these.
     *
     * @param  array<string, mixed>  $filters
     * @return list<string>
     */
    public function countingNotes(array $filters): array
    {
        return [
            'เวลาทั้งหมดเป็นเวลาประเทศไทย',
            '"ข้อมูล ณ" คือเวลาที่ระบบดึงข้อมูลมาสร้างไฟล์นี้ ตัวเลขที่บอกว่า "ตอนนี้" นับ ณ เวลานั้น',
            'รายการใน PDF แสดงไม่เกิน '.number_format(TabularReportExporter::PDF_ROW_LIMIT).' แถว รายการครบทุกแถวอยู่ในไฟล์ Excel ของรายงานเดียวกัน',
        ];
    }

    /**
     * A section's headings as both files print them: money columns end in "(บาท)".
     *
     * @param  array{headings: list<string>, money?: list<int>}  $section
     * @return list<string>
     */
    public static function sectionHeadings(array $section): array
    {
        $money = $section['money'] ?? [];

        return array_map(
            fn (string $heading, int $i) => in_array($i, $money, true) && ! str_contains($heading, 'บาท') ? "{$heading} (บาท)" : $heading,
            $section['headings'],
            array_keys($section['headings']),
        );
    }

    /** Whether charts() draws anything — lets the page hold their place while rows load. */
    public function hasCharts(): bool
    {
        return false;
    }

    /**
     * Whether the page lists the rows under the charts. A report whose charts already say what
     * its table would (one row per department, its status mix) leaves it out on screen; the
     * columns still shape the file export.
     */
    public function showsTable(): bool
    {
        return true;
    }

    /**
     * What the generic page needs to draw this report.
     *
     * @return array{key: string, filters: list<array<string, mixed>>, columns: list<array<string, mixed>>, has_charts: bool, shows_table: bool}
     */
    public function definition(): array
    {
        return [
            'key' => $this->key(),
            'filters' => array_map(fn (ReportFilter $f) => $f->toArray(), $this->filters()),
            'columns' => array_map(fn (ReportColumn $c) => $c->toArray(), $this->screenColumns()),
            'has_charts' => $this->hasCharts(),
            'shows_table' => $this->showsTable(),
        ];
    }

    /**
     * One API row: the model id plus every column's page value, keyed by column key.
     *
     * @return array<string, mixed>
     */
    public function row(Model $model): array
    {
        $row = ['id' => $model->getKey()];
        $links = [];
        foreach ($this->screenColumns() as $column) {
            $row[$column->key] = $column->value($model);
            if (($link = $column->link($model)) !== null) {
                $links[$column->key] = $link;
            }
        }
        // Cell → record page, for the columns declared with linkTo() (ReportColumn).
        $row['_links'] = (object) $links;

        return $row;
    }
}
