<?php

namespace Database\Seeders;

use App\Models\Employee\Position;
use Illuminate\Database\Seeder;

/**
 * The fourteen job titles, transcribed from the database as it stood before the
 * production reset. A flat list — seniority is expressed by the reporting line on
 * each employee, not by a level on the title.
 *
 * Vice President is the one position flagged allow_special_position: it may be saved
 * without a department and without anyone to report to, which is what lets it sit at
 * the top of the tree. Everything below it requires both.
 *
 * firstOrCreate on `code` (PST-####), so re-running adds only what is missing and a
 * title an administrator has since reworded keeps their wording.
 *
 *   php artisan db:seed --class=PositionSeeder
 */
class PositionSeeder extends Seeder
{
    public function run(): void
    {
        // [code, title, allow_special_position]
        $positions = [
            ['PST-0001', 'Vice President', true],
            ['PST-0002', 'Director', false],
            ['PST-0003', 'Senior Manager', false],
            ['PST-0004', 'Manager', false],
            ['PST-0005', 'Asst. Manager', false],
            ['PST-0006', 'Senior Supervisor', false],
            ['PST-0007', 'Supervisor', false],
            ['PST-0008', 'Asst. Supervisor', false],
            ['PST-0009', 'Leader', false],
            ['PST-0010', 'Sub-Leader', false],
            ['PST-0011', 'Head of Line', false],
            ['PST-0012', 'Head of Shift', false],
            ['PST-0013', 'Staff/Officer', false],
            ['PST-0014', 'Subcontract', false],
        ];

        foreach ($positions as [$code, $title, $allowSpecial]) {
            Position::firstOrCreate(
                ['code' => $code],
                ['title' => $title, 'allow_special_position' => $allowSpecial],
            );
        }

        $this->command?->info('Positions: '.Position::query()->count().' rows.');
    }
}
