<?php

namespace App\Services\Report\Tabular;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * A table-style report of the Report Center, declared once: its filters, its query, its
 * columns and its headline numbers. The engine (TabularReportRequest,
 * TabularReportController, TabularReportExporter and the generic React page) does the rest.
 *
 * Access lives in ReportCatalogue, not here, so the hub and the endpoints read one list.
 */
abstract class TabularReport
{
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
     * Headline numbers over the filtered query. Default: the row count.
     *
     * @param  array<string, mixed>  $filters
     * @return list<ReportSummary>
     */
    public function summary(Builder $query, array $filters): array
    {
        return [ReportSummary::make('total', 'ทั้งหมด', (clone $query)->count())];
    }

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
        foreach ($this->columns() as $column) {
            $row[$column->key] = $column->value($model);
        }

        return $row;
    }
}
