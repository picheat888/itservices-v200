<?php

namespace Tests\Feature;

use App\Enums\Request\RequestType;
use App\Enums\Ticket\TicketCategory;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Splitting CCTV and Telephone out of Hardware, and what that costs the roles already granted.
 *
 * Ticket levels are strict — no level for a category means those cases never appear — so a new
 * category arrives invisible to everybody. The backfill migration widens the roles that were
 * already trusted with every category, and leaves alone the ones somebody narrowed on purpose.
 */
class TicketLevelBackfillTest extends TestCase
{
    use RefreshDatabase;

    private const MIGRATION = 'database/migrations/2026_09_18_210000_extend_ticket_levels_to_cctv_and_telephone.php';

    private const EXISTING = [
        'tickets.level_hardware',
        'tickets.level_software',
        'tickets.level_network',
        'tickets.level_other',
    ];

    /** A role holding exactly the given permissions, with the backfill migration not yet run. */
    private function roleWith(string $name, array $permissions): Role
    {
        $role = Role::create(['key' => $name, 'name' => $name]);
        foreach ($permissions as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => true]);
        }

        // RefreshDatabase has already run every migration, so `migrate` would find this one
        // recorded and skip it. The role under test did not exist then — run the backfill's own
        // up() against it directly, which is the code the live database will see.
        (require base_path(self::MIGRATION))->up();

        return $role;
    }

    private function holds(Role $role, string $permission): bool
    {
        return RolePermission::where('role_id', $role->id)
            ->where('permission', $permission)
            ->where('allowed', true)
            ->exists();
    }

    public function test_a_role_trusted_with_every_category_gains_the_two_new_ones(): void
    {
        $role = $this->roleWith('desk', [...self::EXISTING, 'tickets.view_all', 'tickets.resolve']);

        $this->assertTrue($this->holds($role, 'tickets.level_cctv'));
        $this->assertTrue($this->holds($role, 'tickets.level_telephone'));
    }

    public function test_a_role_narrowed_on_purpose_is_left_narrow(): void
    {
        // Somebody scoped this role to network work. Widening it here would undo a decision
        // the migration knows nothing about, which is worse than a category it cannot see.
        $role = $this->roleWith('network-only', ['tickets.level_network', 'tickets.view_all']);

        $this->assertFalse($this->holds($role, 'tickets.level_cctv'));
        $this->assertFalse($this->holds($role, 'tickets.level_telephone'));
    }

    public function test_holding_three_of_the_four_is_not_enough(): void
    {
        $role = $this->roleWith('almost', array_slice(self::EXISTING, 0, 3));

        $this->assertFalse($this->holds($role, 'tickets.level_cctv'));
        $this->assertFalse($this->holds($role, 'tickets.level_telephone'));
    }

    public function test_the_two_categories_carry_their_own_ticket_number_prefix(): void
    {
        // Ticket numbers are permanent, so the codes are pinned rather than left to whoever
        // next edits the enum.
        $this->assertSame('CCTV', TicketCategory::Cctv->shortCode());
        $this->assertSame('TEL', TicketCategory::Telephone->shortCode());
    }

    public function test_a_phone_request_opens_a_phone_case_not_a_hardware_one(): void
    {
        $this->assertSame(TicketCategory::Telephone, RequestType::Telephone->ticketCategory());
    }
}
