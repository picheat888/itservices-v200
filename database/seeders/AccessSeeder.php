<?php

namespace Database\Seeders;

use App\Models\EmailGroup;
use App\Models\Employee;
use App\Models\FileShare;
use App\Models\SocialPlatform;
use Illuminate\Database\Seeder;

class AccessSeeder extends Seeder
{
    public function run(): void
    {
        $emp = Employee::orderBy('id')->pluck('id')->all();
        if (count($emp) < 3) {
            return; // org not seeded
        }

        $qa = EmailGroup::updateOrCreate(['email' => 'qa-team@inaba.co.th'], ['name' => 'QA Team']);
        $it = EmailGroup::updateOrCreate(['email' => 'it-helpdesk@inaba.co.th'], ['name' => 'IT Helpdesk']);
        $qa->memberships()->firstOrCreate(['employee_id' => $emp[0]], ['access_level' => 'Owner', 'granted_at' => '2024-01-15']);
        $qa->memberships()->firstOrCreate(['employee_id' => $emp[1]], ['access_level' => 'Member', 'granted_at' => '2024-02-01']);

        $fs = FileShare::updateOrCreate(['path' => '\\\\FILES\\Recipes\\Plant1'], ['name' => 'Plant 1 Recipes', 'size_label' => '48 GB']);
        $fs->memberships()->firstOrCreate(['employee_id' => $emp[1]], ['access_level' => 'Read', 'granted_at' => '2024-03-04']);

        foreach ([['LINE', '#06C755', 'line.me'], ['Facebook', '#1877F2', 'facebook.com'], ['YouTube', '#FF0000', 'youtube.com']] as [$n, $c, $u]) {
            SocialPlatform::updateOrCreate(['name' => $n], ['color' => $c, 'url' => $u, 'policy' => 'Marketing & official use only']);
        }
        SocialPlatform::where('name', 'LINE')->first()
            ->memberships()->firstOrCreate(['employee_id' => $emp[2]], ['purpose' => 'HR announcements', 'granted_at' => '2024-01-05']);
    }
}
