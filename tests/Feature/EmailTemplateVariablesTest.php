<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\Email\EmailTemplateController;
use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\User;
use App\Support\EmailTemplates;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Each template's own variable list (EmailTemplates::variablesFor), which the editor uses to
 * offer only what that mail is given and to flag anything else — the sender replaces only
 * what it hands over, so a typo or another event's variable reaches the reader as {{text}}.
 */
class EmailTemplateVariablesTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_reads_the_standard_wording_plus_extras_and_the_app_name(): void
    {
        // asset.from is sent with the mail but left out of the standard wording.
        $this->assertSame(
            ['app.name', 'asset.code', 'asset.from', 'asset.model', 'asset.tag', 'asset.type', 'user.first_name'],
            EmailTemplates::variablesFor('asset.assigned'),
        );
        $this->assertContains('digest.total', EmailTemplates::variablesFor('ticket.weekly_digest'));
    }

    public function test_a_key_with_no_standard_has_no_list(): void
    {
        $this->assertNull(EmailTemplates::variablesFor('custom.nothing'));
    }

    /** Whatever a template offers must be fillable in the preview, or inserting it shows nothing. */
    public function test_every_offered_variable_has_a_preview_sample(): void
    {
        $method = new ReflectionMethod(EmailTemplateController::class, 'sampleVars');
        $request = Request::create('/');
        $request->setUserResolver(fn () => new User(['name' => 'Test User', 'email' => 'test@example.com']));
        $samples = array_keys($method->invoke(app(EmailTemplateController::class), $request));

        foreach (EmailTemplates::keys() as $key) {
            $missing = array_diff(EmailTemplates::variablesFor($key), $samples);
            $this->assertSame([], array_values($missing), "{$key} offers variables with no preview sample.");
        }
    }

    public function test_the_index_carries_each_templates_variables(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        EmailTemplate::create(['key' => 'custom.note', 'name' => 'Custom', 'subject' => 'Hi', 'body_html' => '<p>Hi</p>', 'enabled' => true]);
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);

        $rows = collect($this->actingAs(User::factory()->create(['role' => 'super']))
            ->getJson('/api/email-templates')->assertOk()->json('data'))->keyBy('key');

        $this->assertSame(EmailTemplates::variablesFor('asset.return_requested'), $rows['asset.return_requested']['variables']);
        $this->assertNull($rows['custom.note']['variables']);
    }
}
