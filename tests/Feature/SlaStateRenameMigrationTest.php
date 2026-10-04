<?php

namespace Tests\Feature;

use App\Models\Ticket\Ticket;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * The 2026_10_04 data migration that renames the stored SLA state words — 'at_risk' → 'near_due',
 * 'breached' → 'over_sla' — in ticket alert levels, bell payloads, the bells' settings rows and
 * saved backlog filters; and moves every one back on rollback, leaving other rows untouched.
 */
class SlaStateRenameMigrationTest extends TestCase
{
    use RefreshDatabase;

    private function migration(): object
    {
        return require database_path('migrations/2026_10_04_092309_rename_sla_states_to_near_due_and_over_sla.php');
    }

    private function bell(array $data): string
    {
        $id = (string) Str::uuid();
        DB::table('notifications')->insert([
            'id' => $id, 'type' => 'x', 'notifiable_type' => 'App\\Models\\User', 'notifiable_id' => 1,
            'data' => json_encode($data), 'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function bellData(string $id): array
    {
        return json_decode(DB::table('notifications')->where('id', $id)->value('data'), true);
    }

    public function test_stored_sla_words_move_to_the_new_names_and_back(): void
    {
        $ticket = Ticket::factory()->create(['sla_response_alert_level' => 'breached', 'sla_resolve_alert_level' => 'at_risk']);
        $quiet = Ticket::factory()->create();
        $bellBreached = $this->bell(['type' => 'ticket_sla', 'subtype' => 'resolve_breached', 'ticket_no' => 'TKT-ทดสอบ']);
        $bellAtRisk = $this->bell(['type' => 'ticket_sla', 'subtype' => 'response_at_risk']);
        $testBell = $this->bell(['type' => 'notification_test', 'source_key' => 'notif_ticket_sla_response_breached']);
        $otherBell = $this->bell(['type' => 'ticket_assigned', 'subtype' => 'breached']);
        DB::table('notification_templates')->insert([
            'key' => 'notif_ticket_sla_resolve_breached', 'message_en' => 'Edited by admin', 'message_th' => 'แก้โดยแอดมิน',
            'enabled' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $userId = User::factory()->create()->id;
        $schedule = DB::table('report_schedules')->insertGetId([
            'user_id' => $userId, 'report_key' => 'tickets.backlog', 'format' => 'xlsx', 'filters' => json_encode(['sla' => 'breached', 'category' => null]),
            'frequency' => 'daily', 'send_hour' => 8, 'recipients' => json_encode([]), 'active' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->migration()->up();

        $this->assertSame(['over_sla', 'near_due'], [$ticket->fresh()->sla_response_alert_level, $ticket->fresh()->sla_resolve_alert_level]);
        $this->assertNull($quiet->fresh()->sla_response_alert_level);
        $this->assertSame('resolve_over_sla', $this->bellData($bellBreached)['subtype']);
        $this->assertSame('TKT-ทดสอบ', $this->bellData($bellBreached)['ticket_no']);
        $this->assertSame('response_near_due', $this->bellData($bellAtRisk)['subtype']);
        $this->assertSame('notif_ticket_sla_response_over_sla', $this->bellData($testBell)['source_key']);
        // Not an SLA bell: left as it was.
        $this->assertSame('breached', $this->bellData($otherBell)['subtype']);
        // The settings row is renamed in place — the admin's switch and wording stay.
        $row = DB::table('notification_templates')->where('key', 'notif_ticket_sla_resolve_over_sla')->first();
        $this->assertNotNull($row);
        $this->assertSame('Edited by admin', $row->message_en);
        $this->assertSame(0, (int) $row->enabled);
        $this->assertSame(0, DB::table('notification_templates')->where('key', 'notif_ticket_sla_resolve_breached')->count());
        $this->assertSame(['sla' => 'over_sla', 'category' => null], json_decode(DB::table('report_schedules')->where('id', $schedule)->value('filters'), true));

        $this->migration()->down();

        $this->assertSame(['breached', 'at_risk'], [$ticket->fresh()->sla_response_alert_level, $ticket->fresh()->sla_resolve_alert_level]);
        $this->assertSame('resolve_breached', $this->bellData($bellBreached)['subtype']);
        $this->assertSame('notif_ticket_sla_response_breached', $this->bellData($testBell)['source_key']);
        $this->assertSame(1, DB::table('notification_templates')->where('key', 'notif_ticket_sla_resolve_breached')->count());
        $this->assertSame(['sla' => 'breached', 'category' => null], json_decode(DB::table('report_schedules')->where('id', $schedule)->value('filters'), true));
    }
}
