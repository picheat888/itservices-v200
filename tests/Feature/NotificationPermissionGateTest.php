<?php

namespace Tests\Feature;

use App\Models\Email\EmailTemplate;
use App\Models\Notification\NotificationTemplate;
use App\Models\Permission\Role;
use App\Models\Permission\RolePermission;
use App\Models\User;
use App\Support\NotificationCatalogue;
use App\Support\Permissions;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Email & Notification used to hang off one key, so anyone who could reword a template could
 * also switch it off, send real mail and read every message the system had ever sent.
 *
 * The split is only worth having if the server enforces it, and the hard part is that one
 * endpoint serves both the inline switch and the full editor: the drawer posts every field
 * every time, so the right required has to be decided from what a save CHANGES, not from
 * what it sent.
 */
class NotificationPermissionGateTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::create(['key' => 'super', 'name' => 'Administrator Template', 'is_system' => true]);
    }

    /** @param  list<string>  $permissions */
    private function userWith(array $permissions): User
    {
        $role = Role::create(['key' => 'ntf_'.uniqid(), 'name' => 'Notification Test', 'is_system' => false]);
        foreach ($permissions as $key) {
            RolePermission::create(['role_id' => $role->id, 'permission' => $key, 'allowed' => true]);
        }

        return User::factory()->create(['role_id' => $role->id]);
    }

    private function emailTemplate(): EmailTemplate
    {
        // A migration already seeds the standard templates, so take the row over rather
        // than inserting a second one on the same key.
        return EmailTemplate::updateOrCreate(['key' => 'ticket.created'], [
            'name' => 'Ticket created',
            'subject' => 'Subject',
            'body_html' => '<p>Body</p>',
            'enabled' => true,
            'cadence' => 'realtime',
        ]);
    }

    public function test_the_master_alone_opens_the_page_and_nothing_else(): void
    {
        $template = $this->emailTemplate();
        $this->actingAs($this->userWith(['notifications.module']));

        $this->getJson('/api/email-templates')->assertOk();
        $this->getJson('/api/notification-templates')->assertOk();

        // Reading is not editing: every write is refused, and so is the log.
        $this->putJson("/api/email-templates/{$template->id}", ['subject' => 'Changed'])->assertForbidden();
        $this->postJson("/api/email-templates/{$template->id}/test")->assertForbidden();
        $this->getJson('/api/email-logs')->assertForbidden();
    }

    public function test_without_the_master_nothing_opens_at_all(): void
    {
        // Holding a child right without the master must not be a way in — the same rule
        // normalizeNotifications() enforces when permissions are saved.
        $this->actingAs($this->userWith(['notifications.email_edit', 'notifications.logs']));

        $this->getJson('/api/email-templates')->assertForbidden();
        $this->getJson('/api/email-logs')->assertForbidden();
        $this->getJson('/api/notification-templates')->assertForbidden();
    }

    public function test_rewording_an_email_does_not_let_you_switch_it_off(): void
    {
        $template = $this->emailTemplate();
        $this->actingAs($this->userWith(['notifications.module', 'notifications.email_edit']));

        $this->putJson("/api/email-templates/{$template->id}", ['subject' => 'Reworded'])->assertOk();
        $this->assertSame('Reworded', $template->fresh()->subject);

        // The editor posts every field, so this is the shape that has to be refused.
        $this->putJson("/api/email-templates/{$template->id}", ['subject' => 'Reworded', 'enabled' => false])->assertForbidden();
        $this->assertTrue($template->fresh()->enabled, 'Switched off by someone who may only reword it.');
    }

    public function test_switching_an_email_off_does_not_let_you_reword_it(): void
    {
        $template = $this->emailTemplate();
        $this->actingAs($this->userWith(['notifications.module', 'notifications.email_toggle']));

        $this->putJson("/api/email-templates/{$template->id}", ['enabled' => false])->assertOk();
        $this->assertFalse($template->fresh()->enabled);

        $this->putJson("/api/email-templates/{$template->id}", ['subject' => 'Sneaked in'])->assertForbidden();
        $this->assertSame('Subject', $template->fresh()->subject);
    }

    public function test_resending_a_row_unchanged_needs_no_right_beyond_the_master(): void
    {
        $template = $this->emailTemplate();
        $this->actingAs($this->userWith(['notifications.module']));

        // Nothing moved, so nothing was decided. Refusing this would make the editor unusable
        // for somebody who opened a template and pressed save without touching it.
        $this->putJson("/api/email-templates/{$template->id}", [
            'subject' => $template->subject,
            'enabled' => $template->enabled,
        ])->assertOk();
    }

    public function test_the_same_split_holds_for_in_app_notifications(): void
    {
        $standard = NotificationCatalogue::find('notif_asset_assigned');
        $this->actingAs($this->userWith(['notifications.module', 'notifications.inapp_edit']));

        $this->putJson('/api/notification-templates/notif_asset_assigned', [
            'message_en' => 'Reworded',
            'message_th' => $standard['message_th'],
            'enabled' => $standard['enabled'],
        ])->assertOk();
        $this->assertSame('Reworded', NotificationTemplate::where('key', 'notif_asset_assigned')->first()->message_en);

        $this->putJson('/api/notification-templates/notif_asset_assigned', [
            'message_en' => 'Reworded',
            'message_th' => $standard['message_th'],
            'enabled' => false,
        ])->assertForbidden();
        $this->assertTrue(NotificationTemplate::where('key', 'notif_asset_assigned')->first()->enabled);
    }

    public function test_sending_test_mail_and_reading_the_log_are_their_own_rights(): void
    {
        $template = $this->emailTemplate();

        $this->actingAs($this->userWith(['notifications.module', 'notifications.email_test']));
        $this->postJson("/api/email-templates/{$template->id}/test")->assertOk();
        $this->getJson('/api/email-logs')->assertForbidden();

        $this->actingAs($this->userWith(['notifications.module', 'notifications.logs']));
        $this->getJson('/api/email-logs')->assertOk();
        $this->postJson("/api/email-templates/{$template->id}/test")->assertForbidden();
    }

    public function test_saving_a_role_drops_every_child_when_the_master_is_not_granted(): void
    {
        $role = Role::create(['key' => 'ntf_norm', 'name' => 'Normalise Test', 'is_system' => false]);
        $this->actingAs(User::factory()->create(['role' => 'super']));

        $this->putJson("/api/permissions/{$role->key}", [
            'permissions' => ['notifications.email_edit', 'notifications.logs', 'tickets.module'],
        ])->assertOk();

        $kept = RolePermission::where('role_id', $role->id)->where('allowed', true)->pluck('permission')->all();
        $this->assertNotContains('notifications.email_edit', $kept);
        $this->assertNotContains('notifications.logs', $kept);
        // Other modules are untouched by the notifications gate.
        $this->assertContains('tickets.module', $kept);
    }

    public function test_the_catalogue_and_the_hierarchy_list_the_same_keys(): void
    {
        $hierarchy = Permissions::notificationHierarchy();
        $fromTree = [$hierarchy['master'], ...array_keys($hierarchy['groups'])];
        $fromCatalogue = array_values(array_filter(Permissions::all(), fn ($k) => str_starts_with($k, 'notifications.')));

        sort($fromTree);
        sort($fromCatalogue);
        $this->assertSame($fromCatalogue, $fromTree);
    }
}
