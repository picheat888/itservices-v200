<?php

use App\Enums\Ticket\SlaScope;
use App\Models\Settings\AppSetting;
use App\Support\TicketSla;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Resolution targets as rows an administrator can add to, instead of one JSON blob.
 *
 * The per-priority map lived in app_settings as a JSON string whose shape was fixed by
 * TicketSla::defaults() — fine while the only question was "how urgent", impossible the moment
 * somebody wants a target for a kind of request the code does not know about in advance.
 *
 * Rows here are OVERRIDES, never requirements: the table can be empty and every case still
 * resolves a target through TicketSla::defaults(), which is what keeps a fresh install working.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sla_targets', function (Blueprint $table) {
            $table->id();
            // What the row is keyed on (SlaScope) and the value it matches: a priority
            // ('critical') or a request type ('computer'). Deliberately a plain string —
            // request types come from an enum that grows, and a FK to nothing is noise.
            $table->string('scope', 20);
            $table->string('match_value', 40);
            $table->unsignedSmallInteger('resolve_hours');
            // Switched off rather than deleted: turning a target off for a month and back on
            // is a thing people do, and deleting loses the number they will want again.
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            // One target per thing — a duplicate would make "which rule applied" unanswerable.
            $table->unique(['scope', 'match_value']);
        });

        // Carry over whatever was saved in the JSON key so nobody loses the numbers they
        // typed, then drop the key: two sources for one answer is how they drift apart.
        $stored = json_decode((string) AppSetting::get(TicketSla::KEY, '{}'), true);
        foreach (is_array($stored) ? $stored : [] as $priority => $row) {
            $hours = (int) ($row['resolve'] ?? 0);
            if ($hours > 0) {
                DB::table('sla_targets')->insert([
                    'scope' => SlaScope::Priority->value,
                    'match_value' => (string) $priority,
                    'resolve_hours' => $hours,
                    'enabled' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        AppSetting::query()->where('key', TicketSla::KEY)->delete();
    }

    public function down(): void
    {
        // Put the priority rows back where they came from, so a rollback is not a data loss.
        $map = DB::table('sla_targets')
            ->where('scope', SlaScope::Priority->value)
            ->pluck('resolve_hours', 'match_value')
            ->map(fn ($hours) => ['resolve' => (int) $hours])
            ->all();

        if ($map !== []) {
            AppSetting::put(TicketSla::KEY, json_encode($map));
        }

        Schema::dropIfExists('sla_targets');
    }
};
