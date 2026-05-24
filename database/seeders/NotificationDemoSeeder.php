<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Seeds demo in-app (database) notifications for the bell/dropdown so the
 * Notifications UI can be exercised without waiting for real events.
 *
 * Targets every user who can set employee credentials (the recipients of the
 * real NewEmployeeNotification). Rows are tagged data->seed = SEED_TAG so this
 * seeder can clear and re-create only its own demo rows — real notifications
 * are never touched. Safe to run repeatedly (idempotent).
 */
class NotificationDemoSeeder extends Seeder
{
    /** Marker stored in each demo notification's data payload. */
    private const SEED_TAG = 'notification-demo';

    /** Notification class — matches the real one so the UI renders identically. */
    private const TYPE = \App\Notifications\NewEmployeeNotification::class;

    public function run(): void
    {
        $recipients = User::all()->filter(
            fn (User $u) => $u->hasPermission('employees.set_credentials')
        );

        if ($recipients->isEmpty()) {
            $this->command?->warn('No users with employees.set_credentials — skipping notification demo.');

            return;
        }

        // Pick a handful of employees to reference; fall back gracefully if few exist.
        $employees = Employee::orderBy('id')->take(6)->get();
        if ($employees->isEmpty()) {
            $this->command?->warn('No employees found — skipping notification demo.');

            return;
        }

        // Remove only this seeder's previous demo rows (keeps real notifications).
        DB::table('notifications')
            ->where('type', self::TYPE)
            ->whereJsonContains('data->seed', self::SEED_TAG)
            ->delete();

        // minutes-ago offset per item + which ones are already read (older = read).
        $plan = [
            ['offset' => 3,     'read' => false],
            ['offset' => 45,    'read' => false],
            ['offset' => 180,   'read' => false],
            ['offset' => 1440,  'read' => true],   // 1 day
            ['offset' => 4320,  'read' => true],   // 3 days
            ['offset' => 10080, 'read' => true],   // 7 days
        ];

        $now = now();
        $rows = [];

        foreach ($recipients as $user) {
            foreach ($employees as $i => $emp) {
                $p = $plan[$i] ?? ['offset' => 60 * ($i + 1), 'read' => false];
                $createdAt = $now->copy()->subMinutes($p['offset']);

                $rows[] = [
                    'id'              => (string) Str::uuid(),
                    'type'            => self::TYPE,
                    'notifiable_type' => User::class,
                    'notifiable_id'   => $user->id,
                    'data'            => json_encode([
                        'type'          => 'new_employee',
                        'subtype'       => 'credentials_required',
                        'employee_id'   => $emp->id,
                        'employee_name' => $emp->name,
                        'employee_code' => $emp->code,
                        'seed'          => self::SEED_TAG,
                    ]),
                    'read_at'    => $p['read'] ? $createdAt->copy()->addMinutes(5) : null,
                    'created_at' => $createdAt,
                    'updated_at' => $createdAt,
                ];
            }
        }

        DB::table('notifications')->insert($rows);

        $this->command?->info(sprintf(
            'Seeded %d demo notifications for %d recipient(s).',
            count($rows),
            $recipients->count()
        ));
    }
}
