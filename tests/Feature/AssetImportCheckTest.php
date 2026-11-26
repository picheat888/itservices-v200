<?php

// Checking an asset import file: master data matching, closest names, required columns, duplicates and cell formats.

namespace Tests\Feature;

use App\Models\Asset\Asset;
use App\Models\Permission\RolePermission;
use App\Models\Settings\AppSetting;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Services\Asset\AssetImportChecker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Tests\Concerns\MakesXlsxUploads;
use Tests\TestCase;

class AssetImportCheckTest extends TestCase
{
    use MakesXlsxUploads;
    use RefreshDatabase;

    private Category $notebook;

    private Brand $lenovo;

    private AssetModel $thinkpad;

    private Warehouse $warehouse;

    private Vendor $vendor;

    protected function setUp(): void
    {
        parent::setUp();
        AppSetting::flushCache();
        $this->notebook = Category::create(['name' => 'Notebook', 'name_th' => 'โน้ตบุ๊ก']);
        Category::create(['name' => 'Printer']);
        $this->lenovo = Brand::create(['name' => 'Lenovo']);
        $this->thinkpad = AssetModel::create(['name' => 'ThinkPad E14 Gen 6', 'brand_id' => $this->lenovo->id]);
        $this->warehouse = Warehouse::create(['name' => 'Main']);
        $this->vendor = Vendor::create(['name' => 'IT City', 'name_th' => 'ไอทีซิตี้']);
    }

    private function checker(): AssetImportChecker
    {
        return app(AssetImportChecker::class);
    }

    /**
     * @param  array<string, string>  $cells
     * @return array<string, string>
     */
    private function rentedCells(array $cells = []): array
    {
        return $cells + ['category' => 'Notebook', 'brand' => 'Lenovo', 'model' => 'ThinkPad E14 Gen 6', 'serial' => 'SN-1', 'warehouse' => 'Main'];
    }

    /**
     * @param  array<string, string>  $cells
     * @return array<string, string>
     */
    private function purchasedCells(array $cells = []): array
    {
        return $cells + $this->rentedCells() + ['value' => '1000', 'vendor' => 'IT City', 'purchase_date' => '2026-11-12', 'warranty_end' => '2029-11-12'];
    }

    /**
     * @param  list<array<string, string>>  $cellRows
     * @return list<array<string, mixed>>
     */
    private function check(string $kind, array $cellRows): array
    {
        $rows = [];
        foreach ($cellRows as $i => $cells) {
            $rows[] = ['line' => $i + 2, 'cells' => $cells];
        }

        return $this->checker()->check($kind, $rows)['rows'];
    }

    /**
     * @param  array<string, string>  $cells
     * @return list<array<string, mixed>>
     */
    private function issuesOf(string $kind, array $cells, string $column): array
    {
        $issues = $this->check($kind, [$cells])[0]['issues'];

        return array_values(array_filter($issues, fn (array $i) => $i['column'] === $column));
    }

    public function test_names_match_master_data_ignoring_case_space_and_language(): void
    {
        $row = $this->check('purchased', [$this->purchasedCells(['category' => ' notebook ', 'vendor' => 'ไอทีซิตี้'])])[0];
        $this->assertSame([], $row['issues']);
        $this->assertSame($this->notebook->id, $row['values']['category_id']);
        $this->assertSame($this->vendor->id, $row['values']['vendor_id']);

        $thai = $this->check('rented', [$this->rentedCells(['category' => 'โน้ตบุ๊ก'])])[0];
        $this->assertSame($this->notebook->id, $thai['values']['category_id']);

        $printer = $this->check('rented', [$this->rentedCells(['category' => 'printer'])])[0];
        $this->assertSame([], $printer['issues']);
    }

    public function test_a_model_must_belong_to_the_brand_and_the_dropdown_form_is_accepted(): void
    {
        Brand::create(['name' => 'Dell']);

        $wrong = $this->issuesOf('rented', $this->rentedCells(['brand' => 'Dell']), 'model');
        $this->assertSame('model_not_in_brand', $wrong[0]['code']);

        $dropdown = $this->check('rented', [$this->rentedCells(['model' => 'ThinkPad E14 Gen 6 (Lenovo)'])])[0];
        $this->assertSame([], $dropdown['issues']);
        $this->assertSame($this->thinkpad->id, $dropdown['values']['model_id']);
    }

    public function test_a_near_miss_offers_the_closest_name_first(): void
    {
        $near = $this->issuesOf('rented', $this->rentedCells(['category' => 'Notbook']), 'category')[0];
        $this->assertSame('not_found', $near['code']);
        $this->assertSame($this->notebook->id, $near['closest']);
        $this->assertSame('Notebook', $near['closest_name']);

        $far = $this->issuesOf('rented', $this->rentedCells(['category' => 'zzzz']), 'category')[0];
        $this->assertSame('not_found', $far['code']);
        $this->assertArrayNotHasKey('closest', $far);
    }

    public function test_required_columns_follow_the_register_form(): void
    {
        $rented = $this->check('rented', [$this->rentedCells(['brand' => '', 'serial' => '', 'warehouse' => ''])])[0]['issues'];
        $codes = collect($rented)->pluck('code', 'column')->all();
        $this->assertSame('required', $codes['brand']);
        $this->assertSame('required', $codes['serial']);
        $this->assertSame('required', $codes['warehouse']);

        $this->assertSame('required', $this->issuesOf('purchased', $this->purchasedCells(['purchase_date' => '']), 'purchase_date')[0]['code']);
        $this->assertSame([], $this->check('purchased', [$this->purchasedCells(['warranty_end' => '', 'warranty_lifetime' => 'ใช่'])])[0]['issues']);
        $this->assertSame('required', $this->issuesOf('purchased', $this->purchasedCells(['warranty_end' => '']), 'warranty_end')[0]['code']);
    }

    public function test_serials_may_not_repeat_in_the_file_or_among_assets_still_held(): void
    {
        $held = Asset::factory()->create(['serial' => 'PF4XK101', 'status' => 'ready']);
        Asset::factory()->create(['serial' => 'GONE-1', 'status' => 'writeoff']);

        $rows = $this->check('rented', [
            $this->rentedCells(['serial' => 'DUP-1']),
            $this->rentedCells(['serial' => 'dup-1']),
            $this->rentedCells(['serial' => 'pf4xk101']),
            $this->rentedCells(['serial' => 'GONE-1']),
        ]);

        $this->assertSame([], $rows[0]['issues']);
        $this->assertSame('dup_in_file', $rows[1]['issues'][0]['code']);
        $this->assertSame(2, $rows[1]['issues'][0]['line']);
        $this->assertSame('serial_taken', $rows[2]['issues'][0]['code']);
        $this->assertSame($held->asset_code, $rows[2]['issues'][0]['asset_code']);
        $this->assertSame([], $rows[3]['issues']);
    }

    public function test_codes_tags_prices_dates_and_yes_no_are_checked(): void
    {
        $existing = Asset::factory()->create(['serial' => 'X-1', 'status' => 'ready']);

        $rows = $this->check('purchased', [
            $this->purchasedCells(['serial' => 'A1', 'asset_code' => $existing->asset_code]),
            $this->purchasedCells(['serial' => 'A2', 'asset_code' => 'NEW-1']),
            $this->purchasedCells(['serial' => 'A3', 'asset_code' => 'new-1']),
        ]);
        $this->assertSame('code_taken', $rows[0]['issues'][0]['code']);
        $this->assertSame([], $rows[1]['issues']);
        $this->assertSame('dup_in_file', $rows[2]['issues'][0]['code']);

        $tag = $this->issuesOf('rented', $this->rentedCells(['tag' => 'ABCDEFGHIJKLM']), 'tag')[0];
        $this->assertSame(['too_long', 10, 13], [$tag['code'], $tag['max'], $tag['length']]);

        $this->assertSame('28500.00', $this->check('purchased', [$this->purchasedCells(['value' => '28,500.00'])])[0]['values']['value']);
        $this->assertSame('not_a_number', $this->issuesOf('purchased', $this->purchasedCells(['value' => '28,5OO']), 'value')[0]['code']);

        $this->assertSame('bad_date', $this->issuesOf('purchased', $this->purchasedCells(['purchase_date' => '31/02/2026']), 'purchase_date')[0]['code']);
        $this->assertSame('bad_date', $this->issuesOf('purchased', $this->purchasedCells(['purchase_date' => '12 Nov 2026']), 'purchase_date')[0]['code']);
        $this->assertSame('2026-11-12', $this->check('purchased', [$this->purchasedCells(['purchase_date' => '12/11/2569'])])[0]['values']['purchase_date']);
        $this->assertSame('2026-11-12', $this->check('purchased', [$this->purchasedCells(['purchase_date' => '2026-11-12'])])[0]['values']['purchase_date']);

        AppSetting::put('date_format', 'ymd_dash');
        $this->assertSame('2026-11-12', $this->check('purchased', [$this->purchasedCells(['purchase_date' => '2026-11-12'])])[0]['values']['purchase_date']);
        AppSetting::put('date_format', 'dmy_slash');

        $this->assertTrue($this->check('purchased', [$this->purchasedCells(['warranty_lifetime' => 'Yes'])])[0]['values']['warranty_lifetime']);
        $this->assertSame('not_yes_no', $this->issuesOf('purchased', $this->purchasedCells(['warranty_lifetime' => 'maybe']), 'warranty_lifetime')[0]['code']);
    }

    public function test_dates_follow_the_date_format_setting_and_the_buddhist_era(): void
    {
        $date = fn (string $text): array => $this->check('purchased', [$this->purchasedCells(['purchase_date' => $text])])[0];

        $this->assertSame('2026-11-12', $date('12/11/2026')['values']['purchase_date']);
        $this->assertSame('2026-11-12', $date('12-11-2026')['values']['purchase_date']);
        $this->assertSame('2026-11-12', $date('12/11/2569')['values']['purchase_date']);

        AppSetting::put('date_format', 'ymd_slash');
        $this->assertSame('2026-11-12', $date('2026/11/12')['values']['purchase_date']);
        $this->assertSame('bad_date', $date('12/11/2026')['issues'][0]['code']);
        AppSetting::put('date_format', 'dmy_slash');
    }

    public function test_a_file_that_is_not_xlsx_is_refused_as_unreadable(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.register', 'allowed' => true]);
        $file = UploadedFile::fake()->createWithContent('assets.csv', "a,b\n1,2\n");

        $this->actingAs($user)->post('/api/assets/import/preview', ['file' => $file, 'kind' => 'rented'], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('message', 'import_unreadable');
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function flatRow(array $row = []): array
    {
        return $row + [
            'line' => 2, 'category_id' => $this->notebook->id, 'brand_id' => $this->lenovo->id, 'model_id' => $this->thinkpad->id,
            'serial' => 'RC-1', 'warehouse_id' => $this->warehouse->id,
        ];
    }

    /** @return list<string> codes of the issues for column on the only row, or [] */
    private function recheckCodes(string $kind, array $row, string $column): array
    {
        $result = $this->checker()->recheck($kind, [$row]);

        return array_values(array_map(fn (array $i) => $i['code'], array_filter($result[0]['issues'] ?? [], fn (array $i) => $i['column'] === $column)));
    }

    public function test_recheck_passes_a_clean_row_and_reports_only_rows_with_issues(): void
    {
        $this->assertSame([], $this->checker()->recheck('rented', [$this->flatRow()]));

        $result = $this->checker()->recheck('rented', [$this->flatRow(), $this->flatRow(['line' => 3, 'serial' => ''])]);
        $this->assertSame([3], array_column($result, 'line'));
        $this->assertSame('required', $result[0]['issues'][0]['code']);
    }

    public function test_recheck_catches_stale_ids_and_a_model_of_another_brand(): void
    {
        $dell = Brand::create(['name' => 'Dell']);

        $this->assertSame(['not_found'], $this->recheckCodes('rented', $this->flatRow(['category_id' => 99999]), 'category'));
        $this->assertSame(['not_found'], $this->recheckCodes('rented', $this->flatRow(['warehouse_id' => '99999']), 'warehouse'));
        $this->assertSame(['model_not_in_brand'], $this->recheckCodes('rented', $this->flatRow(['brand_id' => $dell->id]), 'model'));
    }

    public function test_recheck_catches_a_serial_taken_meanwhile_and_bad_cells(): void
    {
        $held = Asset::factory()->create(['serial' => 'RC-1', 'status' => 'ready']);

        $result = $this->checker()->recheck('purchased', [$this->flatRow([
            'value' => '12x', 'vendor_id' => $this->vendor->id, 'purchase_date' => '2026-02-31', 'warranty_end' => '2029-11-12',
            'tag' => 'ABCDEFGHIJKLM', 'warranty_lifetime' => 'yes',
        ])]);
        $issues = collect($result[0]['issues']);

        $this->assertSame($held->asset_code, $issues->firstWhere('code', 'serial_taken')['asset_code']);
        $this->assertNotNull($issues->firstWhere('code', 'not_a_number'));
        $this->assertSame('purchase_date', $issues->firstWhere('code', 'bad_date')['column']);
        $this->assertSame(10, $issues->firstWhere('code', 'too_long')['max']);
        $this->assertNotNull($issues->firstWhere('code', 'not_yes_no'));
    }

    public function test_recheck_requires_warranty_end_unless_lifetime(): void
    {
        $purchased = $this->flatRow(['value' => '100.00', 'vendor_id' => $this->vendor->id, 'purchase_date' => '2026-11-12']);

        $this->assertSame(['required'], $this->recheckCodes('purchased', $purchased, 'warranty_end'));
        $this->assertSame([], $this->checker()->recheck('purchased', [$purchased + ['warranty_lifetime' => true]]));
    }

    public function test_the_preview_endpoint_answers_rows_options_and_counts(): void
    {
        $user = User::factory()->create(['role' => 'user']);
        $file = $this->xlsxUpload(['ทรัพย์สินเช่า' => [
            ['ประเภท', 'ยี่ห้อ', 'รุ่น', 'Serial', 'คลัง', 'สี'],
            ['Notebook', 'Lenovo', 'ThinkPad E14 Gen 6', 'S-1', 'Main', 'ดำ'],
            ['Notebook', 'Lenovo', 'ThinkPad E14 Gen 6', 'S-2', 'Main', 'ขาว'],
            ['Notbook', 'Lenovo', 'ThinkPad E14 Gen 6', 'S-3', 'Main', 'แดง'],
        ]]);
        $headers = ['Accept' => 'application/json'];

        $this->actingAs($user)->post('/api/assets/import/preview', ['file' => $file, 'kind' => 'rented'], $headers)->assertForbidden();

        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'assets.register', 'allowed' => true]);
        $response = $this->actingAs($user)->post('/api/assets/import/preview', ['file' => $file, 'kind' => 'rented'], $headers);

        $response->assertOk()
            ->assertJsonPath('data.meta.total', 3)
            ->assertJsonPath('data.meta.valid', 2)
            ->assertJsonPath('data.meta.invalid', 1)
            ->assertJsonPath('data.meta.ignored_columns', ['สี'])
            ->assertJsonPath('data.options.categories.0.name', 'Notebook')
            ->assertJsonPath('data.options.models.0.brand_id', $this->lenovo->id);
    }
}
