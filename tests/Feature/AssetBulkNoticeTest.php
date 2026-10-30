<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Asset\Asset;
use App\Models\Asset\AssetTransfer;
use App\Models\Email\EmailTemplate;
use App\Models\Employee\Employee;
use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\Settings\Location;
use App\Models\Stock\Warehouse;
use App\Models\User;
use App\Support\NotificationCatalogue;
use Database\Seeders\EmailTemplateSeeder;
use Database\Seeders\NotificationTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/** A bulk hand-over or recall tells each person once, listing every asset (AST-16). */
class AssetBulkNoticeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
        Warehouse::firstOrCreate(['name' => 'Central IT']);
        $this->actingAs(User::factory()->create(['role' => 'super']));
    }

    /** An employee with a login account, so the bell and mail have somewhere to go. */
    private function person(string $code): array
    {
        $employee = Employee::create(['code' => $code, 'first_name' => 'Som', 'last_name' => $code, 'status' => 'active']);
        Role::firstOrCreate(['key' => 'staff'], ['name' => 'Staff', 'is_system' => false]);
        $user = User::factory()->create(['role' => 'staff', 'employee_id' => $employee->id, 'email' => strtolower($code).'@inaba.co.th']);

        return [$employee, $user];
    }

    /** @return list<array{key: string, to: string, html: string}> */
    private function mails(): array
    {
        return collect(Bus::dispatched(SendTemplatedEmail::class))->map(fn (SendTemplatedEmail $job) => [
            'key' => $this->prop($job, 'templateKey'),
            'to' => $this->prop($job, 'toEmail'),
            'html' => $this->prop($job, 'html'),
        ])->values()->all();
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_a_bulk_hand_over_rings_once_and_mails_once_with_every_asset(): void
    {
        Bus::fake();
        [$employee, $user] = $this->person('EMP-B1');
        $assets = collect(['BK-01', 'BK-02', 'BK-03'])->map(fn ($code) => Asset::factory()->create(['asset_code' => $code, 'status' => 'ready', 'owner' => null, 'owner_employee_id' => null]));
        $location = Location::create(['name' => 'HQ']);

        $this->postJson('/api/assets/bulk-transfer', ['ids' => $assets->pluck('id')->all(), 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertOk();

        $bells = $user->notifications()->get();
        $this->assertCount(1, $bells);
        $this->assertSame('asset_assigned', $bells[0]->data['type']);
        $this->assertSame(3, $bells[0]->data['count']);
        $this->assertSame(['BK-01', 'BK-02', 'BK-03'], $bells[0]->data['asset_tags']);

        $mails = $this->mails();
        $this->assertSame(['asset.assigned_many'], array_column($mails, 'key'));
        foreach (['BK-01', 'BK-02', 'BK-03', '3 assets have been transferred'] as $text) {
            $this->assertStringContainsString($text, $mails[0]['html']);
        }
        $this->assertStringNotContainsString('{{', $mails[0]['html']);
    }

    public function test_a_bulk_hand_over_of_one_asset_keeps_the_single_bell_and_mail(): void
    {
        Bus::fake();
        [$employee, $user] = $this->person('EMP-B2');
        $asset = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson('/api/assets/bulk-transfer', ['ids' => [$asset->id], 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertOk();

        $this->assertArrayNotHasKey('count', $user->notifications()->first()->data);
        $this->assertSame(['asset.assigned'], array_column($this->mails(), 'key'));
    }

    public function test_a_bulk_recall_tells_each_holder_once(): void
    {
        Bus::fake();
        [$many, $manyUser] = $this->person('EMP-B3');
        [$one, $oneUser] = $this->person('EMP-B4');
        $held = Asset::factory()->create(['status' => 'deployed', 'owner_employee_id' => $many->id, 'owner' => null]);
        $pending = Asset::factory()->create(['status' => 'pending_acceptance', 'owner_employee_id' => $many->id, 'owner' => null]);
        $single = Asset::factory()->create(['status' => 'pending_acceptance', 'owner_employee_id' => $one->id, 'owner' => null]);

        $this->postJson('/api/assets/bulk-recall', ['ids' => [$held->id, $pending->id, $single->id], 'warehouse' => 'Central IT'])
            ->assertOk()->assertJsonPath('updated', 3);

        $bells = $manyUser->notifications()->get();
        $this->assertCount(1, $bells);
        $this->assertSame(['asset_recalled', 'taken_back', 2], [$bells[0]->data['type'], $bells[0]->data['subtype'], $bells[0]->data['count']]);
        $this->assertSame(1, $oneUser->notifications()->count());
        $this->assertArrayNotHasKey('count', $oneUser->notifications()->first()->data);

        $byRecipient = collect($this->mails())->groupBy('to')->map(fn ($mails) => $mails->pluck('key')->all());
        $this->assertSame(['asset.recalled_many'], $byRecipient['emp-b3@inaba.co.th']);
        $this->assertSame(['asset.recalled'], $byRecipient['emp-b4@inaba.co.th']);
    }

    public function test_a_bulk_hand_over_that_fails_part_way_moves_nothing_and_tells_nobody(): void
    {
        Bus::fake();
        [$employee, $user] = $this->person('EMP-B6');
        [$first, $second] = [
            Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]),
            Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]),
        ];
        $location = Location::create(['name' => 'HQ']);
        Asset::updating(function (Asset $asset) use ($second) {
            if ($asset->id === $second->id) {
                throw new \RuntimeException('disk full');
            }
        });

        $this->postJson('/api/assets/bulk-transfer', ['ids' => [$first->id, $second->id], 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertServerError();

        $this->assertSame('ready', $first->fresh()->status->value);
        $this->assertNull($first->fresh()->owner_employee_id);
        $this->assertSame(0, AssetTransfer::count());
        $this->assertSame(0, $user->notifications()->count());
        $this->assertSame([], $this->mails());
    }

    public function test_switching_off_the_single_hand_over_bell_and_mail_silences_the_bulk_ones(): void
    {
        Bus::fake();
        $this->seed(NotificationTemplateSeeder::class);
        NotificationTemplate::where('key', 'notif_asset_assigned')->update(['enabled' => false]);
        EmailTemplate::where('key', 'asset.assigned')->update(['enabled' => false]);
        NotificationCatalogue::forgetSwitches();
        [$employee, $user] = $this->person('EMP-B7');
        $assets = Asset::factory()->count(2)->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson('/api/assets/bulk-transfer', ['ids' => $assets->pluck('id')->all(), 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertOk();

        $this->assertSame(0, $user->notifications()->count());
        $this->assertSame([], $this->mails());
        NotificationCatalogue::forgetSwitches();
    }

    public function test_a_refused_bulk_hand_over_tells_nobody(): void
    {
        Bus::fake();
        [$employee, $user] = $this->person('EMP-B5');
        $ready = Asset::factory()->create(['status' => 'ready', 'owner' => null, 'owner_employee_id' => null]);
        $writtenOff = Asset::factory()->create(['status' => 'writeoff', 'owner' => null, 'owner_employee_id' => null]);
        $location = Location::create(['name' => 'HQ']);

        $this->postJson('/api/assets/bulk-transfer', ['ids' => [$ready->id, $writtenOff->id], 'mode' => 'employee', 'owner_employee_id' => $employee->id, 'location_id' => $location->id])
            ->assertStatus(422);

        $this->assertSame(0, $user->notifications()->count());
        $this->assertSame([], $this->mails());
    }
}
