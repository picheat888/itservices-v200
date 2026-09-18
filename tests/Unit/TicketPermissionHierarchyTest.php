<?php

namespace Tests\Unit;

use App\Enums\Ticket\TicketCategory;
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
            'tickets.level_hardware', 'tickets.level_software', 'tickets.level_network',
            'tickets.level_cctv', 'tickets.level_telephone', 'tickets.level_other',
            'tickets.create', 'tickets.edit_own', 'tickets.my', 'tickets.jobs',
        ];

        $this->assertEqualsCanonicalizing($full, Permissions::normalizeTickets($full));
    }

    /**
     * A category with no level key of its own is a category nobody can be granted, which reads
     * as an empty queue rather than a missing permission. The catalog and the hierarchy have to
     * grow with the enum, so this counts them against it.
     */
    public function test_every_ticket_category_has_a_level_key(): void
    {
        $levels = array_keys(Permissions::ticketHierarchy()['groups']);
        $catalog = Permissions::catalog()['tickets'] ?? [];

        foreach (TicketCategory::cases() as $category) {
            $key = "tickets.level_{$category->value}";
            $this->assertContains($key, $levels, "{$key} is missing from ticketHierarchy()");
            $this->assertContains("level_{$category->value}", $catalog, "{$key} is missing from catalog()");
        }
    }

    public function test_non_ticket_keys_pass_through(): void
    {
        $out = Permissions::normalizeTickets(['stock.view', 'tickets.resolve']);

        $this->assertSame(['stock.view'], $out);
    }
}
