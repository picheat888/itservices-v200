<?php

// The asset import .xlsx templates: column order, header styling and locking, dropdowns, guide sheet and permission.

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Brand;
use App\Models\Settings\Category;
use App\Models\Settings\Vendor;
use App\Models\Stock\Warehouse;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use Tests\Concerns\MakesXlsxUploads;
use Tests\TestCase;

class AssetImportTemplateTest extends TestCase
{
    use MakesXlsxUploads;
    use RefreshDatabase;

    private function userWith(string ...$permissions): User
    {
        $user = User::factory()->create(['role' => 'user']);
        foreach ($permissions as $permission) {
            RolePermission::create(['role_id' => $user->role_id, 'permission' => $permission, 'allowed' => true]);
        }

        return $user;
    }

    private ?User $registrar = null;

    private function template(string $kind): Spreadsheet
    {
        $this->actingAs($this->registrar ??= $this->userWith('assets.register'));

        return $this->xlsxFromResponse($this->get("/api/assets/import-template?kind={$kind}")->assertOk());
    }

    /** @return list<string> */
    private function headerRow(Spreadsheet $book): array
    {
        $sheet = $book->getSheet(0);

        return array_values(array_filter($sheet->rangeToArray('A1:'.$sheet->getHighestColumn().'1')[0], fn ($v) => $v !== null));
    }

    public function test_the_rented_template_has_the_eight_columns_in_order(): void
    {
        $book = $this->template('rented');

        $this->assertSame('ทรัพย์สินเช่า', $book->getSheet(0)->getTitle());
        $this->assertSame(['รหัสทรัพย์สิน (Asset No.)', 'Tag', 'ประเภท (Type)', 'ยี่ห้อ (Brand)', 'รุ่น (Model)', 'Serial (Serial No.)', 'คลัง (Warehouse)', 'หมายเหตุ (Remark)'], $this->headerRow($book));
    }

    public function test_the_purchased_template_has_the_thirteen_columns_in_order(): void
    {
        $book = $this->template('purchased');

        $this->assertSame('ทรัพย์สินซื้อ', $book->getSheet(0)->getTitle());
        $this->assertSame([
            'รหัสทรัพย์สิน (Asset No.)', 'ประเภท (Type)', 'ยี่ห้อ (Brand)', 'รุ่น (Model)', 'Serial (Serial No.)', 'คลัง (Warehouse)', 'Tag',
            'ราคาซื้อ (Price)', 'ผู้ขาย (Vendor)', 'วันที่ซื้อ (Purchase date)', 'สิ้นสุดวันรับประกัน (Warranty ends)', 'ประกันตลอดชีพ (Lifetime warranty)', 'หมายเหตุ (Remark)',
        ], $this->headerRow($book));
    }

    public function test_headers_are_plain_black_text_and_row_one_is_frozen_and_locked(): void
    {
        foreach (['rented', 'purchased'] as $kind) {
            $book = $this->template($kind);
            foreach ($book->getAllSheets() as $template) {
                $lastColumn = $template->getHighestColumn(1);
                foreach (range('A', $lastColumn) as $letter) {
                    $font = $template->getStyle("{$letter}1")->getFont();
                    $this->assertFalse($font->getBold(), "{$kind} {$template->getTitle()} {$letter}1");
                    $this->assertSame('FF000000', $font->getColor()->getARGB(), "{$kind} {$template->getTitle()} {$letter}1");
                }
            }
        }

        $sheet = $this->template('rented')->getSheet(0);
        $this->assertSame('A2', $sheet->getFreezePane());

        $protection = $sheet->getProtection();
        $this->assertTrue($protection->getSheet());
        $this->assertSame('', $protection->getPassword());
        $this->assertFalse($protection->getInsertRows());
        $this->assertFalse($protection->getDeleteRows());
        $this->assertFalse($protection->getSort());
        $this->assertFalse($protection->getAutoFilter());
        $this->assertFalse($protection->getFormatCells());
        $this->assertSame('protected', $sheet->getStyle('A1')->getProtection()->getLocked());
        // Rows 2 and below take the column style, which is unlocked for every data column
        $book = $sheet->getParent();
        foreach (['A', 'H'] as $letter) {
            $xf = $book->getCellXfByIndex($sheet->getColumnDimension($letter)->getXfIndex());
            $this->assertSame('unprotected', $xf->getProtection()->getLocked());
        }
    }

    /** Excel reads showDropDown="1" as "hide the in-cell arrow", so a list column must never carry it. */
    public function test_list_columns_show_the_dropdown_arrow_in_excel(): void
    {
        $this->actingAs($this->registrar ??= $this->userWith('assets.register'));

        foreach (['rented' => 4, 'purchased' => 5] as $kind => $listColumns) {
            $path = tempnam(sys_get_temp_dir(), 'xlsx');
            file_put_contents($path, $this->get("/api/assets/import-template?kind={$kind}")->assertOk()->streamedContent());
            $zip = new \ZipArchive;
            $this->assertTrue($zip->open($path));
            $sheetXml = (string) $zip->getFromName('xl/worksheets/sheet1.xml');
            $zip->close();

            preg_match_all('/<dataValidation [^>]*type="list"[^>]*>/', $sheetXml, $lists);
            $this->assertCount($listColumns, $lists[0], $kind);
            foreach ($lists[0] as $tag) {
                $this->assertStringNotContainsString('showDropDown="1"', $tag, $kind);
            }
        }
    }

    public function test_list_columns_have_dropdowns_from_the_lists_sheet(): void
    {
        Category::firstOrCreate(['name' => 'Notebook']);
        $brand = Brand::create(['name' => 'Lenovo']);
        AssetModel::create(['name' => 'ThinkPad E14 Gen 6', 'brand_id' => $brand->id]);
        Warehouse::create(['name' => 'คลังกลาง สำนักงานใหญ่']);
        Vendor::create(['name' => 'IT City Co., Ltd.']);

        $book = $this->template('rented');
        $lists = $book->getSheetByName('รายการที่ใช้ได้');
        $this->assertNotNull($lists);
        $values = array_merge(...$lists->toArray(null, false, false));
        foreach (['Notebook', 'Lenovo', 'ThinkPad E14 Gen 6 (Lenovo)', 'คลังกลาง สำนักงานใหญ่'] as $expected) {
            $this->assertContains($expected, $values);
        }

        $validation = $book->getSheet(0)->getCell('C2')->getDataValidation();
        $this->assertSame(DataValidation::TYPE_LIST, $validation->getType());
        $this->assertStringContainsString('รายการที่ใช้ได้', $validation->getFormula1());
        $this->assertSame('C2:C501', $validation->getSqref());

        $purchased = $this->template('purchased');
        $this->assertSame(DataValidation::TYPE_LIST, $purchased->getSheet(0)->getCell('I2')->getDataValidation()->getType());
    }

    public function test_the_template_has_no_example_rows_and_only_the_data_and_lists_sheets(): void
    {
        foreach (['rented' => 'ทรัพย์สินเช่า', 'purchased' => 'ทรัพย์สินซื้อ'] as $kind => $dataSheet) {
            $book = $this->template($kind);

            $rows = $book->getSheet(0)->toArray(null, false, false);
            $this->assertCount(0, array_filter(array_slice($rows, 1), fn (array $row) => array_filter($row, fn ($v) => $v !== null && $v !== '') !== []));
            $this->assertSame([$dataSheet, 'รายการที่ใช้ได้'], $book->getSheetNames());
        }
    }

    public function test_the_template_needs_the_register_right(): void
    {
        $this->actingAs($this->userWith('assets.view'));
        $this->getJson('/api/assets/import-template?kind=rented')->assertForbidden();

        $this->actingAs($this->userWith('assets.register'));
        $this->getJson('/api/assets/import-template?kind=other')->assertUnprocessable();
    }
}
