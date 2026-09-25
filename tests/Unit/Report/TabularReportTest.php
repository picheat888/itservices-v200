<?php

namespace Tests\Unit\Report;

use App\Models\User;
use App\Services\Report\Tabular\ReportColumn;
use App\Services\Report\Tabular\ReportFilter;
use App\Services\Report\Tabular\TabularReport;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Tests\TestCase;

/**
 * The tabular report engine's own rules — filter validation/defaults, column value
 * shaping for the page and for exports — checked on a throwaway definition.
 */
class TabularReportTest extends TestCase
{
    private function report(): TabularReport
    {
        return new class extends TabularReport
        {
            public function key(): string
            {
                return 'demo.list';
            }

            public function title(): string
            {
                return 'รายงานทดสอบ';
            }

            public function filters(): array
            {
                return [
                    ReportFilter::select('within', [['value' => 30, 'label_key' => 'rep_opt_30d'], ['value' => 90, 'label_key' => 'rep_opt_90d']], 90),
                    ReportFilter::date('as_of'),
                    ReportFilter::search(),
                ];
            }

            public function query(User $viewer, array $filters): Builder
            {
                throw new \LogicException('not used in unit tests');
            }

            public function columns(): array
            {
                return [
                    ReportColumn::text('code', 'รหัส', fn (Model $m) => $m->code),
                    ReportColumn::localized('dept', 'แผนก', fn (Model $m) => ['name' => 'Sales', 'name_th' => 'ฝ่ายขาย']),
                    ReportColumn::money('value', 'มูลค่า', fn (Model $m) => '1234.5'),
                    ReportColumn::date('ends', 'สิ้นสุด', fn (Model $m) => CarbonImmutable::parse('2026-10-05 13:00')),
                    ReportColumn::daysLeft('left', 'เหลือ', fn (Model $m) => CarbonImmutable::parse('2026-10-05')),
                    ReportColumn::enum('status', 'สถานะ', fn (Model $m) => 'ready', ['ready' => 'asset_ready'], ['ready' => 'พร้อมจ่าย']),
                ];
            }
        };
    }

    private function row(): Model
    {
        $model = new class extends Model {};
        $model->forceFill(['id' => 7, 'code' => 'A-1']);

        return $model;
    }

    public function test_rules_cover_every_filter(): void
    {
        $rules = $this->report()->rules();

        $this->assertSame(['nullable', 'in:30,90'], array_map('strval', $rules['within']));
        $this->assertSame(['nullable', 'date_format:Y-m-d'], $rules['as_of']);
        $this->assertSame(['nullable', 'string', 'max:100'], $rules['search']);
    }

    public function test_defaults_fill_in_missing_filters(): void
    {
        $filters = $this->report()->resolveFilters(['search' => 'abc']);

        $this->assertSame(['within' => 90, 'as_of' => null, 'search' => 'abc'], $filters);
    }

    public function test_row_shapes_values_for_the_page(): void
    {
        $this->travelTo('2026-09-25 09:00');

        $row = $this->report()->row($this->row());

        $this->assertSame(7, $row['id']);
        $this->assertSame('A-1', $row['code']);
        $this->assertSame(['name' => 'Sales', 'name_th' => 'ฝ่ายขาย'], $row['dept']);
        $this->assertSame(1234.5, $row['value']);
        $this->assertSame('2026-10-05', $row['ends']);
        $this->assertSame(10, $row['left']);
        $this->assertSame('ready', $row['status']);
    }

    public function test_export_values_are_thai_and_flat(): void
    {
        $columns = $this->report()->columns();
        $row = $this->row();

        $this->assertSame('ฝ่ายขาย', $columns[1]->exportValue($row));
        $this->assertSame('พร้อมจ่าย', $columns[5]->exportValue($row));
    }

    public function test_definition_lists_filters_and_columns_for_the_page(): void
    {
        $definition = $this->report()->definition();

        $this->assertSame('demo.list', $definition['key']);
        $this->assertSame(['within', 'as_of', 'search'], array_column($definition['filters'], 'name'));
        $this->assertSame(90, $definition['filters'][0]['default']);
        $this->assertSame('rep_c_status', $definition['columns'][5]['label_key']);
        $this->assertSame(['ready' => 'asset_ready'], $definition['columns'][5]['labels']);
        $this->assertArrayNotHasKey('heading', $definition['columns'][0]);
    }
}
