<?php

namespace Database\Seeders;

use App\Models\Employee\Department;
use App\Models\Employee\Section;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * The twenty-six sections, transcribed from the database as it stood before the
 * production reset and grouped under the department they belong to.
 *
 * Both languages are carried: `name` is the English label and `name_th` the Thai one,
 * so a section reads the same way as its department in either UI language.
 *
 * Departments are resolved by `tag` rather than by id, because ids depend on insert
 * order and would silently attach a section to the wrong department on any install
 * seeded in a different sequence. A tag with no department is an error, not something
 * to skip: a section quietly missing from the tree is how a hole goes unnoticed.
 *
 * Requires EmployeeDepartmentSeeder first:
 *
 *   php artisan db:seed --class=EmployeeDepartmentSeeder
 *   php artisan db:seed --class=EmployeeSectionSeeder
 */
class EmployeeSectionSeeder extends Seeder
{
    public function run(): void
    {
        // department tag => [section code, English name, Thai name], in the order they were created
        $sections = [
            'IT' => [
                ['SEC-0001', 'Network & Security', 'ส่วนงานเครือข่ายและความปลอดภัย'],
                ['SEC-0002', 'Support', 'ส่วนงานซัพพอร์ตผู้ใช้งาน'],
                ['SEC-0003', 'System analyst', 'ส่วนงานวิเคราะห์ระบบ'],
            ],
            'QC' => [
                ['SEC-0004', 'Quality Control', 'ส่วนงานควบคุมคุณภาพ'],
                ['SEC-0005', 'Research and Development', 'ส่วนงานวิจัยและพัฒนา'],
            ],
            'PD' => [
                ['SEC-0006', 'Machine Operation', 'ส่วนงานควบคุมเครื่องจักร'],
                ['SEC-0007', 'Retrot', 'ส่วนงาน Retort'],
                ['SEC-0008', 'Packing', 'ส่วนงาน Packing '],
                ['SEC-0009', 'Filling', 'ส่วนงาน Filling'],
                ['SEC-0010', 'Raw material', 'ส่วนงานวัตถุดิบ'],
                ['SEC-0011', 'Stock', 'ส่วนงานสต๊อก'],
                ['SEC-0012', 'Loading', 'ส่วนงานโหลดสินค้า'],
                ['SEC-0013', 'Warehouse', 'ส่วนงานคลังสินค้า'],
                ['SEC-0014', 'Forklift', 'ส่วนงานรถ Forklift'],
            ],
            'PU' => [
                ['SEC-0015', 'Purchasing', 'ส่วนงานจัดซื้อ'],
            ],
            'HR' => [
                ['SEC-0016', 'Payroll', 'ส่วนงานเงินเดือนและค่าจ้าง'],
                ['SEC-0017', 'Recruitment', 'ส่วนงานสรรหาว่าจ้าง'],
                ['SEC-0018', 'Training', 'ส่วนงานฝึกอบรม'],
            ],
            'GA' => [
                ['SEC-0019', 'General Affairs', 'ส่วนงานธุรการ'],
            ],
            'ACC' => [
                ['SEC-0020', 'Accounting', 'ส่วนงานบัญชี'],
            ],
            'SALE' => [
                ['SEC-0021', 'Sales', 'ส่วนงานขาย'],
            ],
            'LG' => [
                ['SEC-0022', 'Logistic', 'ส่วนงานโลจิสติกส์'],
            ],
            'MN' => [
                ['SEC-0023', 'Maintenance', 'ส่วนงานซ่อมบำรุง'],
            ],
            'SE' => [
                ['SEC-0024', 'Environment', 'ส่วนงานสิ่งแวดล้อม'],
                ['SEC-0025', 'Safety', 'ส่วนงานความปลอดภัย'],
            ],
        ];

        $departmentIdByTag = Department::pluck('id', 'tag');

        foreach ($sections as $tag => $rows) {
            $departmentId = $departmentIdByTag[$tag]
                ?? throw new RuntimeException("EmployeeSectionSeeder: no department tagged {$tag} - run EmployeeDepartmentSeeder first.");

            foreach ($rows as [$code, $name, $nameTh]) {
                Section::firstOrCreate(
                    ['code' => $code],
                    ['department_id' => $departmentId, 'name' => $name, 'name_th' => $nameTh],
                );
            }
        }

        $this->command?->info('Sections: '.Section::query()->count().' rows.');
    }
}
