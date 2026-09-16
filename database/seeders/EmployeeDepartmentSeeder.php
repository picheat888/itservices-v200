<?php

namespace Database\Seeders;

use App\Models\Employee\Department;
use Illuminate\Database\Seeder;

/**
 * The eleven departments of the organisation, transcribed from the database as it
 * stood before the production reset so a fresh install starts on the real org chart
 * rather than on invented names.
 *
 * `code` (DEP-####) is the identifier rows are matched on — the model assigns one
 * automatically when it is left blank, but they are spelled out here so an install
 * seeded today carries the same codes as the one this came from. `tag` is the short
 * label the UI shows and EmployeeSectionSeeder resolves against.
 *
 * firstOrCreate, so re-running adds only what is missing: a department an
 * administrator has since renamed keeps their name.
 *
 *   php artisan db:seed --class=EmployeeDepartmentSeeder
 */
class EmployeeDepartmentSeeder extends Seeder
{
    public function run(): void
    {
        // [code, tag, name, name_th]
        $departments = [
            ['DEP-0001', 'MN', 'Maintenance', 'ฝ่ายซ่อมบำรุง'],
            ['DEP-0002', 'LG', 'Logistic', 'ฝ่ายโลจิสติกส์'],
            ['DEP-0003', 'IT', 'Information Technology', 'ฝ่ายเทคโนโลยีสารสนเทศ'],
            ['DEP-0004', 'SALE', 'Sales', 'ฝ่ายขาย'],
            ['DEP-0005', 'ACC', 'Accounting', 'ฝ่ายบัญชี'],
            ['DEP-0006', 'PD', 'Production', 'ฝ่ายผลิต'],
            ['DEP-0007', 'SE', 'Safety', 'ฝ่ายความปลอดภัย'],
            ['DEP-0008', 'GA', 'General Affairs', 'ฝ่ายธุรการ'],
            ['DEP-0009', 'HR', 'Human Resources', 'ฝ่ายทรัพยากรบุคคล'],
            ['DEP-0010', 'QC', 'Quality Control', 'ฝ่ายควบคุมคุณภาพ'],
            ['DEP-0011', 'PU', 'Purchasing', 'ฝ่ายจัดซื้อ'],
        ];

        foreach ($departments as [$code, $tag, $name, $nameTh]) {
            Department::firstOrCreate(
                ['code' => $code],
                ['tag' => $tag, 'name' => $name, 'name_th' => $nameTh],
            );
        }

        $this->command?->info('Departments: '.Department::query()->count().' rows.');
    }
}
