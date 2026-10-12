<?php

// The Request bell rewording migration: stored standard text moves to the new standard,
// an administrator's own wording is left alone, and down() puts the old text back.

namespace Tests\Feature;

use App\Models\Notification\NotificationTemplate;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationWordingMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_12_111034_update_request_bell_wording_in_notification_templates.php');
    }

    private function storeBell(string $key, string $en, string $th): void
    {
        NotificationTemplate::updateOrCreate(['key' => $key], ['message_en' => $en, 'message_th' => $th, 'enabled' => true]);
    }

    public function test_old_standard_wording_moves_to_the_catalogue_wording(): void
    {
        $migration = $this->migration();
        $wording = (new \ReflectionClass($migration))->getConstant('WORDING');

        // Every bell the migration knows, stored with its old text (an untouched column keeps the standard)
        foreach ($wording as $key => $columns) {
            $standard = NotificationCatalogue::find($key);
            $this->storeBell(
                $key,
                $columns['message_en'][0] ?? $standard['message_en'],
                $columns['message_th'][0] ?? $standard['message_th'],
            );
        }

        $migration->up();

        // 11 Request bells; "rejected" kept its wording
        $this->assertCount(10, $wording);
        foreach (array_keys($wording) as $key) {
            $row = NotificationTemplate::where('key', $key)->firstOrFail();
            $standard = NotificationCatalogue::find($key);
            $this->assertSame($standard['message_en'], $row->message_en, $key);
            $this->assertSame($standard['message_th'], $row->message_th, $key);
        }
    }

    public function test_an_administrators_own_wording_is_kept(): void
    {
        $this->storeBell('notif_request_waiting', 'Please decide on {step}', 'รอการตัดสินจากคุณ - {step}');

        $this->migration()->up();

        $row = NotificationTemplate::where('key', 'notif_request_waiting')->firstOrFail();
        $this->assertSame('Please decide on {step}', $row->message_en);
        $this->assertSame('รอคุณพิจารณา ({step})', $row->message_th);
    }

    public function test_down_restores_the_old_wording(): void
    {
        $standard = NotificationCatalogue::find('notif_request_submitted');
        $this->storeBell('notif_request_submitted', $standard['message_en'], $standard['message_th']);

        $this->migration()->down();

        $row = NotificationTemplate::where('key', 'notif_request_submitted')->firstOrFail();
        $this->assertSame('Submitted - waiting for {step}', $row->message_en);
        $this->assertSame('ส่งคำขอแล้ว - รอ {step} อนุมัติ', $row->message_th);
    }
}
