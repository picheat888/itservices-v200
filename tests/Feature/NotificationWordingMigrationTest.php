<?php

// The bell rewording migrations: stored standard text moves to the new standard,
// an administrator's own wording is left alone, and down() puts the old text back.

namespace Tests\Feature;

use App\Models\Notification\NotificationTemplate;
use App\Support\NotificationCatalogue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationWordingMigrationTest extends TestCase
{
    use RefreshDatabase;

    private const REQUEST_REWORDING = '2026_10_12_111034_update_request_bell_wording_in_notification_templates.php';

    private const SEPARATOR_REWORDING = '2026_10_15_144607_update_bell_wording_without_separators_in_notification_templates.php';

    private function migration(string $file): object
    {
        return require database_path('migrations/'.$file);
    }

    /** @return array<string, array<string, array{0: string, 1: string}>> */
    private function wording(object $migration): array
    {
        return (new \ReflectionClass($migration))->getConstant('WORDING');
    }

    private function storeBell(string $key, string $en, string $th): void
    {
        NotificationTemplate::updateOrCreate(['key' => $key], ['message_en' => $en, 'message_th' => $th, 'enabled' => true]);
    }

    /** Every bell the migration knows, stored with its old text (an untouched column keeps the standard). */
    private function storeOldWording(array $wording): void
    {
        foreach ($wording as $key => $columns) {
            $standard = NotificationCatalogue::find($key);
            $this->storeBell(
                $key,
                $columns['message_en'][0] ?? $standard['message_en'],
                $columns['message_th'][0] ?? $standard['message_th'],
            );
        }
    }

    public function test_old_request_wording_moves_to_the_reworded_text(): void
    {
        $migration = $this->migration(self::REQUEST_REWORDING);
        $wording = $this->wording($migration);
        $this->storeOldWording($wording);

        $migration->up();

        // 11 Request bells; "rejected" kept its wording
        $this->assertCount(10, $wording);
        foreach ($wording as $key => $columns) {
            $row = NotificationTemplate::where('key', $key)->firstOrFail();
            foreach ($columns as $column => $pair) {
                $this->assertSame($pair[1], $row->{$column}, "{$key}.{$column}");
            }
        }
    }

    public function test_an_administrators_own_wording_is_kept(): void
    {
        $this->storeBell('notif_request_waiting', 'Please decide on {step}', 'รอการตัดสินจากคุณ - {step}');

        $this->migration(self::REQUEST_REWORDING)->up();

        $row = NotificationTemplate::where('key', 'notif_request_waiting')->firstOrFail();
        $this->assertSame('Please decide on {step}', $row->message_en);
        $this->assertSame('รอคุณพิจารณา ({step})', $row->message_th);
    }

    public function test_down_restores_the_old_wording(): void
    {
        $this->storeBell('notif_request_submitted', 'Submitted, waiting for {step}', 'ส่งคำขอแล้ว รอ {step} อนุมัติ');

        $this->migration(self::REQUEST_REWORDING)->down();

        $row = NotificationTemplate::where('key', 'notif_request_submitted')->firstOrFail();
        $this->assertSame('Submitted - waiting for {step}', $row->message_en);
        $this->assertSame('ส่งคำขอแล้ว - รอ {step} อนุมัติ', $row->message_th);
    }

    public function test_separator_rewording_moves_old_standard_text_to_the_catalogue(): void
    {
        $migration = $this->migration(self::SEPARATOR_REWORDING);
        $wording = $this->wording($migration);
        $this->storeOldWording($wording);

        $migration->up();

        foreach (array_keys($wording) as $key) {
            $row = NotificationTemplate::where('key', $key)->firstOrFail();
            $standard = NotificationCatalogue::find($key);
            $this->assertSame($standard['message_en'], $row->message_en, $key);
            $this->assertSame($standard['message_th'], $row->message_th, $key);
        }
    }

    public function test_separator_rewording_keeps_an_administrators_wording_and_reverses(): void
    {
        $standard = NotificationCatalogue::find('notif_ticket_new');
        $this->storeBell('notif_ticket_new', 'A new one came in', 'เคสใหม่รอการรับ - แตะเพื่อดู');
        $migration = $this->migration(self::SEPARATOR_REWORDING);

        $migration->up();

        $row = NotificationTemplate::where('key', 'notif_ticket_new')->firstOrFail();
        $this->assertSame('A new one came in', $row->message_en);
        $this->assertSame($standard['message_th'], $row->message_th);

        $migration->down();
        $this->assertSame('เคสใหม่รอการรับ - แตะเพื่อดู', $row->fresh()->message_th);
    }

    public function test_no_standard_bell_message_uses_a_dash_separator(): void
    {
        foreach (NotificationCatalogue::all() as $bell) {
            $this->assertStringNotContainsString(' - ', $bell['message_en'], $bell['key']);
            $this->assertStringNotContainsString(' - ', $bell['message_th'], $bell['key']);
        }
    }
}
