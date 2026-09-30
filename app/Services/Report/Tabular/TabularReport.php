<?php

namespace App\Services\Report\Tabular;

use App\Models\User;
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
     * The columns an export prints: every column, or the chosen ones in their report order.
     *
     * @return list<ReportColumn>
     */
    public function exportColumns(): array
    {
        $columns = $this->columns();
        if ($this->shownColumns === null) {
            return $columns;
        }

        return array_values(array_filter($columns, fn (ReportColumn $c) => in_array($c->key, $this->shownColumns, true)));
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
     * What the generic page needs to draw this report.
     *
     * @return array{key: string, filters: list<array<string, mixed>>, columns: list<array<string, mixed>>}
     */
    public function definition(): array
    {
        return [
            'key' => $this->key(),
            'filters' => array_map(fn (ReportFilter $f) => $f->toArray(), $this->filters()),
            'columns' => array_map(fn (ReportColumn $c) => $c->toArray(), $this->columns()),
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
        foreach ($this->columns() as $column) {
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
