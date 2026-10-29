<?php

// GET /api/settings/mail reports only whether a password is stored, never the password itself (SET-18).

namespace Tests\Feature;

use App\Models\Permission\RolePermission;
use App\Models\Settings\MailSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MailSettingsSecrecyTest extends TestCase
{
    use RefreshDatabase;

    public function test_mail_settings_never_return_the_password(): void
    {
        MailSetting::current()->update(['host' => 'smtp.example.test', 'password' => 'p4ss-secret']);
        $user = User::factory()->create(['role' => 'admin']);
        RolePermission::create(['role_id' => $user->role_id, 'permission' => 'settings.email', 'allowed' => true]);

        $response = $this->actingAs($user)->getJson('/api/settings/mail')->assertOk();

        $response->assertJsonMissingPath('data.password');
        $response->assertJsonPath('data.has_password', true);
        $this->assertStringNotContainsString('p4ss-secret', $response->getContent());
    }
}
