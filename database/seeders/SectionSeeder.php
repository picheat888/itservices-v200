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
 * Departments are resolved by `tag` rather than by id, because ids depend on insert
 * order and would silently attach a section to the wrong department on any install
 * seeded in a different sequence. A tag with no department is an error, not something
 * to skip: a section quietly missing from the tree is how a hole goes unnoticed.
 *
 * Requires DepartmentSeeder first:
 *
 *   php artisan db:seed --class=DepartmentSeeder
 *   php artisan db:seed --class=SectionSeeder
 */
class SectionSeeder extends Seeder
{
    public function run(): void
    {
        // department tag => [section codes and names, in the order they were created]
        $sections = [
            'It' => [
                ['SEC-0001', 'Network & Security'],
                ['SEC-0002', 'Support'],
                ['SEC-0003', 'System analyst'],
            ],
            'QC' => [
                ['SEC-0004', 'Quality Control'],
                ['SEC-0005', 'Quality Assurance'],
                ['SEC-0006', 'Research and Development'],
            ],
            'PD' => [
                ['SEC-0007', 'Machine Operation'],
                ['SEC-0008', 'Retrot'],
                ['SEC-0009', 'Packing'],
                ['SEC-0010', 'Filling'],
                ['SEC-0011', 'Raw material'],
                ['SEC-0012', 'Stock'],
                ['SEC-0013', 'Loading'],
                ['SEC-0014', 'Warehouse'],
                ['SEC-0015', 'Forklift'],
            ],
            'PU' => [
                ['SEC-0016', 'Purchasing'],
            ],
            'HR' => [
                ['SEC-0017', 'Payroll'],
                ['SEC-0018', 'Recruitment'],
                ['SEC-0019', 'Training'],
            ],
            'GA' => [
                ['SEC-0020', 'General Affairs'],
            ],
            'Acc' => [
                ['SEC-0021', 'Accounting'],
            ],
            'Sales' => [
                ['SEC-0022', 'Sales'],
            ],
            'Lg' => [
                ['SEC-0023', 'Logistic'],
            ],
            'Mn' => [
                ['SEC-0024', 'Maintenance'],
            ],
            'SE' => [
                ['SEC-0025', 'Environment'],
                ['SEC-0026', 'Occupational Safety & Health'],
            ],
        ];

        $departmentIdByTag = Department::pluck('id', 'tag');

        foreach ($sections as $tag => $rows) {
            $departmentId = $departmentIdByTag[$tag]
                ?? throw new RuntimeException("SectionSeeder: no department tagged {$tag} — run DepartmentSeeder first.");

            foreach ($rows as [$code, $name]) {
                Section::firstOrCreate(
                    ['code' => $code],
                    ['department_id' => $departmentId, 'name' => $name, 'name_th' => null],
                );
            }
        }

        $this->command?->info('Sections: '.Section::query()->count().' rows.');
    }
}
