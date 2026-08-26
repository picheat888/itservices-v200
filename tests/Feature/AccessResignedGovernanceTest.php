<?php

namespace Tests\Feature;

use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\Access\FileShare;
use App\Models\Access\Software;
use App\Models\Employee\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The Access overview's governance rows.
 *
 * Three things were wrong. The card counted distinct people while its drill-down listed one
 * row per grant (1 vs 3 on the same screen). A resource still OWNED by someone who had left
 * never showed up at all — only their memberships did. And the two rows blurred together:
 * one bucket mixed "revoke this grant" with "find a new owner", while the ownership row
 * ticked green as long as a name was filled in, however long ago that person left.
 *
 * The rows now split by remedy: grants to revoke in one, resources needing a custodian in
 * the other — whether nobody was ever named or the named one has gone.
 */
class AccessResignedGovernanceTest extends TestCase
{
    use RefreshDatabase;

    private function leaver(): Employee
    {
        return Employee::create([
            'code' => 'EMP-GONE', 'first_name' => 'Gone', 'last_name' => 'Away', 'status' => 'resigned',
        ]);
    }

    private function stayer(): Employee
    {
        return Employee::create(['code' => 'EMP-HERE', 'first_name' => 'Still', 'last_name' => 'Here']);
    }

    /** @return array<string, mixed> */
    private function governance(): array
    {
        $this->actingAs(User::factory()->create(['role' => 'super']));

        return $this->getJson('/api/access/dashboard')->assertOk()->json('data.governance');
    }

    public function test_the_row_count_matches_the_list_it_opens(): void
    {
        $leaver = $this->leaver();
        $group = EmailGroup::create(['code' => 'EG-1', 'name' => 'Group one', 'email' => 'one@x.test']);
        $share = FileShare::create(['code' => 'FS-1', 'name' => 'Share one', 'path' => '\\srv\one']);
        $app = Software::create(['code' => 'SW-1', 'name' => 'App one']);

        foreach ([[EmailGroup::class, $group], [FileShare::class, $share], [Software::class, $app]] as [$type, $resource]) {
            AccessMembership::create([
                'resource_type' => (new $type)->getMorphClass(),
                'resource_id' => $resource->id,
                'employee_id' => $leaver->id,
                'granted_at' => now(),
            ]);
        }

        $gov = $this->governance();

        // One person, three grants: the number must be the work queue, not the headcount.
        $this->assertCount(3, $gov['issues']['resigned']);
        $this->assertSame(3, $gov['resigned_holders']);
    }

    public function test_a_resource_owned_by_a_leaver_needs_a_new_owner(): void
    {
        $leaver = $this->leaver();
        EmailGroup::create(['code' => 'EG-2', 'name' => 'Owned group', 'email' => 'two@x.test', 'owner_employee_id' => $leaver->id]);
        FileShare::create(['code' => 'FS-2', 'name' => 'Owned share', 'path' => '\\srv\two', 'owner_employee_id' => $leaver->id]);

        $gov = $this->governance();
        $rows = collect($gov['issues']['no_owner']);

        // Same job as a resource nobody ever owned, so it lands in the same queue.
        $this->assertSame(2, $gov['no_owner']);
        $this->assertFalse($gov['owners_complete']);
        $this->assertEqualsCanonicalizing(['Owned group', 'Owned share'], $rows->pluck('name')->all());
        $this->assertSame(['resigned', 'resigned'], $rows->pluck('reason')->all());
        $this->assertSame([$leaver->name, $leaver->name], $rows->pluck('employee')->all());
        // A grant is a different remedy, so the revoke queue stays empty.
        $this->assertSame(0, $gov['resigned_holders']);
    }

    public function test_both_ways_of_losing_an_owner_share_one_row(): void
    {
        $leaver = $this->leaver();
        EmailGroup::create(['code' => 'EG-3', 'name' => 'Handed over', 'email' => 'three@x.test', 'owner_employee_id' => $leaver->id]);
        FileShare::create(['code' => 'FS-3', 'name' => 'Never owned', 'path' => '\\srv\three']);

        $gov = $this->governance();
        $rows = collect($gov['issues']['no_owner']);

        $this->assertSame(2, $gov['no_owner']);
        // The one with a name to hand over from comes first; the drill-down tells them apart.
        $this->assertSame(['resigned', 'none'], $rows->pluck('reason')->all());
        $this->assertSame('Handed over', $rows->first()['name']);
        $this->assertNull($rows->last()['employee']);
    }

    public function test_staff_who_are_still_here_raise_nothing(): void
    {
        $stayer = $this->stayer();
        $group = EmailGroup::create(['code' => 'EG-4', 'name' => 'Live group', 'email' => 'four@x.test', 'owner_employee_id' => $stayer->id]);
        AccessMembership::create([
            'resource_type' => (new EmailGroup)->getMorphClass(),
            'resource_id' => $group->id,
            'employee_id' => $stayer->id,
            'granted_at' => now(),
        ]);

        $gov = $this->governance();

        $this->assertSame(0, $gov['resigned_holders']);
        $this->assertSame([], $gov['issues']['resigned']);
        // An owner who is still here means the ownership row keeps its tick.
        $this->assertSame(0, $gov['no_owner']);
        $this->assertTrue($gov['owners_complete']);
    }

    public function test_a_revoked_grant_is_not_a_leftover(): void
    {
        $leaver = $this->leaver();
        AccessMembership::create([
            'resource_type' => (new Software)->getMorphClass(),
            'resource_id' => Software::create(['code' => 'SW-5', 'name' => 'App five'])->id,
            'employee_id' => $leaver->id,
            'granted_at' => now()->subDay(),
            'revoked_at' => now(),
        ]);

        $gov = $this->governance();

        $this->assertSame(0, $gov['resigned_holders']);
    }

    public function test_the_revoke_queue_has_a_stable_order(): void
    {
        $second = Employee::create(['code' => 'EMP-GONE2', 'first_name' => 'Also', 'last_name' => 'Gone', 'status' => 'resigned']);
        $first = $this->leaver();

        // Created deliberately out of order so a passing test cannot be the database's doing.
        foreach ([[$second, 'Zulu app'], [$first, 'Bravo app'], [$first, 'Alpha app']] as $i => [$who, $name]) {
            AccessMembership::create([
                'resource_type' => (new Software)->getMorphClass(),
                'resource_id' => Software::create(['code' => "SW-ORD-{$i}", 'name' => $name])->id,
                'employee_id' => $who->id,
                'granted_at' => now(),
            ]);
        }

        $rows = collect($this->governance()['issues']['resigned']);

        $this->assertSame(['Also Gone', 'Gone Away', 'Gone Away'], $rows->pluck('employee')->all());
        $this->assertSame(['Zulu app', 'Alpha app', 'Bravo app'], $rows->pluck('name')->all());
    }
}
