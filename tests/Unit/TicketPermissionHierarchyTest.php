<?php

namespace Tests\Unit;

use App\Support\Permissions;
use PHPUnit\Framework\TestCase;

class TicketPermissionHierarchyTest extends TestCase
{
    public function test_children_require_their_group_view(): void
    {
        // resolve/forward/assign require tickets.view_all.
        $out = Permissions::normalizeTickets(['tickets.module', 'tickets.resolve', 'tickets.forward', 'tickets.assign']);

        $this->assertSame(['tickets.module'], $out);
    }

    public function test_group_keys_require_the_master(): void
    {
        $out = Permissions::normalizeTickets([
            'tickets.view_dashboard', 'tickets.view_all', 'tickets.resolve',
            'tickets.level_hardware', 'tickets.jobs',
        ]);

        $this->assertSame([], $out);
    }

    public function test_self_service_survives_without_the_master(): void
    {
        $out = Permissions::normalizeTickets(['tickets.create', 'tickets.edit_own', 'tickets.my']);

        $this->assertEqualsCanonicalizing(['tickets.create', 'tickets.edit_own', 'tickets.my'], $out);
    }

    public function test_edit_own_requires_create(): void
    {
        $out = Permissions::normalizeTickets(['tickets.edit_own', 'tickets.my']);

        $this->assertSame(['tickets.my'], $out);
    }

    public function test_full_staff_set_passes_through(): void
    {
        $full = [
            'tickets.module', 'tickets.view_dashboard', 'tickets.view_all',
            'tickets.resolve', 'tickets.forward', 'tickets.assign',
            'tickets.level_hardware', 'tickets.level_software', 'tickets.level_network', 'tickets.level_other',
            'tickets.create', 'tickets.edit_own', 'tickets.my', 'tickets.jobs',
        ];

        $this->assertEqualsCanonicalizing($full, Permissions::normalizeTickets($full));
    }

    public function test_non_ticket_keys_pass_through(): void
    {
        $out = Permissions::normalizeTickets(['stock.view', 'tickets.resolve']);

        $this->assertSame(['stock.view'], $out);
    }
}
