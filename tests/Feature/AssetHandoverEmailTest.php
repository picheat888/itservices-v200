<?php

namespace Tests\Feature;

use App\Jobs\SendTemplatedEmail;
use App\Models\Asset\Asset;
use App\Models\Employee\Employee;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Services\Asset\AssetService;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use ReflectionObject;
use Tests\TestCase;

/**
 * The mail somebody gets when a device is put in their name.
 *
 * Its body was truncated in the catalogue itself — it ended mid-list on "Tag:" with no
 * closing tag and no closing line. Three of these went out that way. An unbalanced tag
 * survives all the way into the message, so this is the sort of thing that has to be
 * asserted rather than eyeballed.
 */
class AssetHandoverEmailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(EmailTemplateSeeder::class);
    }

    /** A holder with a login that may see My Assets — the gate the sender checks. */
    private function holder(): Employee
    {
        $employee = Employee::create([
            'code' => 'EMP-1042', 'first_name' => 'Somchai', 'last_name' => 'Suksawat', 'status' => 'active',
        ]);
        $roleId = Role::firstOrCreate(['key' => 'staff'], ['name' => 'Staff', 'is_system' => false])->id;
        RolePermission::firstOrCreate(['role_id' => $roleId, 'permission' => 'assets.my'], ['allowed' => true]);
        User::factory()->create([
            'role' => 'staff', 'employee_id' => $employee->id,
            'email' => 'somchai@inaba.co.th', 'name' => 'Somchai Suksawat',
        ]);

        return $employee;
    }

    /** Hands the asset to the employee the way the Transfer screen does. */
    private function handOver(Asset $asset, Employee $employee): void
    {
        app(AssetService::class)->transfer($asset, [
            'mode' => 'employee',
            'owner_employee_id' => $employee->id,
            'location_id' => null,
        ]);
    }

    /** @return array{html: string, to: string, label: string}|null */
    private function mail(string $key): ?array
    {
        $job = collect(Bus::dispatched(SendTemplatedEmail::class))
            ->first(fn (SendTemplatedEmail $queued) => $this->prop($queued, 'templateKey') === $key);

        return $job === null ? null : [
            'html' => $this->prop($job, 'html'),
            'to' => $this->prop($job, 'toEmail'),
            'label' => $this->prop($job, 'actionLabel'),
        ];
    }

    private function prop(object $job, string $name): string
    {
        $property = (new ReflectionObject($job))->getProperty($name);
        $property->setAccessible(true);

        return (string) $property->getValue($job);
    }

    public function test_the_hand_over_mail_is_a_whole_message(): void
    {
        Bus::fake();
        $employee = $this->holder();
        $asset = Asset::factory()->create([
            'asset_code' => 'PC042', 'tag' => 'IT-042',
            'owner_employee_id' => null, 'owner' => 'Store IT',
        ]);

        $this->handOver($asset, $employee);

        $mail = $this->mail('asset.assigned');
        $this->assertNotNull($mail, 'A hand-over told the recipient nothing.');
        $this->assertSame('somchai@inaba.co.th', $mail['to']);

        // It used to stop here, mid-list, with the paragraph still open.
        $this->assertSame(
            preg_match_all('/<p(\s[^>]*)?>/i', $mail['html']),
            substr_count(strtolower($mail['html']), '</p>'),
            'the message ends with a paragraph still open'
        );
        $this->assertStringContainsString('please contact IT', $mail['html'], 'the message has no closing line');

        $this->assertStringContainsString('PC042', $mail['html']);
        $this->assertStringContainsString('IT-042', $mail['html']);
        $this->assertStringNotContainsString('{{', $mail['html']);
        $this->assertSame('Accept the hand-over', $mail['label']);
    }

    public function test_it_does_not_tell_the_recipient_where_the_asset_came_from(): void
    {
        Bus::fake();
        $employee = $this->holder();

        // {{asset.from}} is still passed and still offered in the editor, but the standard
        // body no longer prints it: which warehouse or colleague a device passed through on
        // its way here is IT's custody trail, not something the person holding it acts on.
        $asset = Asset::factory()->create(['owner_employee_id' => null, 'owner' => 'Store IT']);
        $this->handOver($asset, $employee);

        $text = html_entity_decode(strip_tags($this->mail('asset.assigned')['html']));
        $this->assertStringNotContainsString('Handed over by', $text);
        $this->assertStringNotContainsString('Store IT', $text);
        // What it does say is the device itself.
        $this->assertStringContainsString('Type:', $text);
    }

    public function test_every_asset_template_closes_the_tags_it_opens(): void
    {
        // Both were unbalanced in the catalogue at the same time, from different mistakes:
        // one paragraph never closed, one opened a second inside the first.
        foreach (collect(EmailTemplates::all())->filter(fn ($t) => str_starts_with($t['key'], 'asset.')) as $template) {
            $this->assertSame(
                preg_match_all('/<p(\s[^>]*)?>/i', $template['body_html']),
                substr_count(strtolower($template['body_html']), '</p>'),
                "{$template['key']} opens and closes a different number of paragraphs"
            );
        }
    }
}
