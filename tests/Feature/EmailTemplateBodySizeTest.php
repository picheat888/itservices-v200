<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Permission\Role;
use App\Models\User;
use Database\Seeders\EmailTemplateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A template body must fit its TEXT column (65,535 bytes), counted in bytes not characters. */
class EmailTemplateBodySizeTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_body_over_the_column_size_is_refused(): void
    {
        $this->seed(EmailTemplateSeeder::class);
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
        $template = EmailTemplate::firstOrFail();
        $this->actingAs(User::factory()->create(['role' => 'super']));

        // 3 bytes per Thai character: 21846 = 65,538 bytes
        $this->putJson("/api/email-templates/{$template->id}", ['body_html' => str_repeat('ก', 21846)])
            ->assertUnprocessable()
            ->assertJsonPath('errors.body_html.0', 'body_too_long');

        $this->putJson("/api/email-templates/{$template->id}", ['body_html' => str_repeat('ก', 21845)])
            ->assertOk();
    }
}
