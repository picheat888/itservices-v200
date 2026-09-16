<?php

namespace Tests\Feature;

use App\Models\Employee\Department;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use Database\Seeders\EmployeeDepartmentSeeder;
use Database\Seeders\EmployeePositionSeeder;
use Database\Seeders\EmployeeSectionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

/**
 * The three org seeders exist to reproduce the organisation exactly as it was before
 * the production reset, so the counts and codes are asserted rather than described:
 * a row dropped in transcription would otherwise only show up as a name missing from
 * a dropdown months later.
 */
class OrgMasterDataSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_seeds_all_eleven_departments_with_their_codes(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);

        $this->assertSame(11, Department::count());
        $this->assertSame(
            ['DEP-0001', 'DEP-0002', 'DEP-0003', 'DEP-0004', 'DEP-0005', 'DEP-0006',
                'DEP-0007', 'DEP-0008', 'DEP-0009', 'DEP-0010', 'DEP-0011'],
            Department::orderBy('code')->pluck('code')->all(),
        );

        $it = Department::where('tag', 'IT')->firstOrFail();
        $this->assertSame('Information Technology', $it->name);
        $this->assertSame('ฝ่ายเทคโนโลยีสารสนเทศ', $it->name_th);

        // Every department carries both languages — the UI shows either.
        $this->assertSame(0, Department::whereNull('name_th')->count());
    }

    public function test_it_seeds_all_fourteen_positions_and_only_the_vp_may_stand_alone(): void
    {
        $this->seed(EmployeePositionSeeder::class);

        $this->assertSame(14, Position::count());
        $this->assertSame('Vice President', Position::where('code', 'PST-0001')->value('title'));
        $this->assertSame('Subcontract', Position::where('code', 'PST-0014')->value('title'));

        // allow_special_position is what lets a title be saved with no department and
        // nobody to report to, which only the top of the tree may do.
        $this->assertSame(
            ['Vice President'],
            Position::where('allow_special_position', true)->pluck('title')->all(),
        );
    }

    public function test_it_seeds_all_twenty_five_sections_under_the_right_departments(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);
        $this->seed(EmployeeSectionSeeder::class);

        $this->assertSame(25, Section::count());
        $this->assertSame(0, Section::whereNull('department_id')->count());

        $byTag = fn (string $tag) => Section::whereHas('department', fn ($q) => $q->where('tag', $tag))
            ->orderBy('code')->pluck('name')->all();

        $this->assertSame(['Network & Security', 'Support', 'System analyst'], $byTag('IT'));
        $this->assertSame(['Payroll', 'Recruitment', 'Training'], $byTag('HR'));
        $this->assertSame(['Environment', 'Safety'], $byTag('SE'));
        // Production carries the most, and is where a dropped row would hide best.
        $this->assertCount(9, $byTag('PD'));
    }

    /**
     * Sections carry both languages, like departments do: a null name_th is what makes a
     * unit fall back to its English label in the Thai UI, which is how a missed row shows.
     */
    public function test_every_section_carries_a_thai_name(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);
        $this->seed(EmployeeSectionSeeder::class);

        $this->assertSame(0, Section::whereNull('name_th')->count());
        $this->assertSame('ส่วนงานเครือข่ายและความปลอดภัย', Section::where('code', 'SEC-0001')->value('name_th'));
        $this->assertSame('ส่วนงานความปลอดภัย', Section::where('code', 'SEC-0025')->value('name_th'));
    }

    /** Sections resolve their department by tag, so a missing department must stop the run. */
    public function test_seeding_sections_without_departments_fails_loudly(): void
    {
        $this->expectException(RuntimeException::class);

        $this->seed(EmployeeSectionSeeder::class);
    }

    public function test_running_all_three_twice_changes_nothing(): void
    {
        foreach ([EmployeeDepartmentSeeder::class, EmployeePositionSeeder::class, EmployeeSectionSeeder::class] as $seeder) {
            $this->seed($seeder);
            $this->seed($seeder);
        }

        $this->assertSame(11, Department::count());
        $this->assertSame(14, Position::count());
        $this->assertSame(25, Section::count());
    }

    /** A rename by an administrator survives a re-seed — firstOrCreate, not updateOrCreate. */
    public function test_re_seeding_keeps_a_name_an_admin_changed(): void
    {
        $this->seed(EmployeeDepartmentSeeder::class);
        Department::where('code', 'DEP-0003')->update(['name' => 'IT & Digital']);

        $this->seed(EmployeeDepartmentSeeder::class);

        $this->assertSame('IT & Digital', Department::where('code', 'DEP-0003')->value('name'));
        $this->assertSame(11, Department::count());
    }
}
