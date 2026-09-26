<?php

namespace Database\Seeders;

use App\Models\Asset\Asset;
use App\Models\Contract\Contract;
use App\Models\Employee\Department;
use App\Models\Employee\Employee;
use App\Models\Employee\Position;
use App\Models\Employee\Section;
use App\Models\Permission\Role;
use App\Models\Request\ServiceRequest;
use App\Models\Settings\Category;
use App\Models\Settings\RequestOption;
use App\Models\Settings\Unit;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockItem;
use App\Models\Stock\Warehouse;
use App\Models\Ticket\Ticket;
use App\Models\User;
use App\Models\Workflow\Workflow;
use Database\Seeders\Demo\DemoAccess;
use Database\Seeders\Demo\DemoAssets;
use Database\Seeders\Demo\DemoClock;
use Database\Seeders\Demo\DemoContext;
use Database\Seeders\Demo\DemoContracts;
use Database\Seeders\Demo\DemoOrg;
use Database\Seeders\Demo\DemoReference;
use Database\Seeders\Demo\DemoRequests;
use Database\Seeders\Demo\DemoStep;
use Database\Seeders\Demo\DemoStock;
use Database\Seeders\Demo\DemoTickets;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;

/**
 * The whole demo dataset in one command, for presentations and UAT:
 *
 *   php artisan db:seed --class=DemoSeeder
 *
 * Runs on an empty, standard-seeded install only (see Readme → Seeding). Every
 * stateful event goes through the application's own services, backdated with
 * DemoClock, so approvals, SLA, FIFO costs, audit rows and bells read exactly as the
 * real flows would have left them. Mail is never sent: the queue is faked for the run.
 */
class DemoSeeder extends Seeder
{
    public const PASSWORD = 'Demo@1234';

    /** @var list<class-string<DemoStep>> In order: later steps read what earlier ones registered. */
    public const STEPS = [
        DemoOrg::class,
        DemoReference::class,
        DemoAccess::class,
        DemoContracts::class,
        DemoAssets::class,
        DemoStock::class,
        DemoTickets::class,
        DemoRequests::class,
    ];

    public function run(): void
    {
        $refusal = $this->refusal();
        if ($refusal !== null) {
            $this->command?->error($refusal);

            return;
        }

        $ctx = $this->runSteps(self::STEPS);
        $this->printAccounts($ctx);
    }

    /**
     * Why this install cannot take the demo, or null when it can.
     */
    public function refusal(): ?string
    {
        $standardSeed = [Department::class, Position::class, Section::class, Category::class, Warehouse::class, Unit::class, RequestOption::class, Workflow::class];
        $missing = collect($standardSeed)->contains(fn (string $model) => ! $model::query()->exists());
        if ($missing || ! Role::where('key', 'admin')->exists()) {
            return 'Run the standard seed first: EmployeeDepartmentSeeder, EmployeePositionSeeder, '
                .'EmployeeSectionSeeder, MasterDataSeeder, then `php artisan db:seed` (see Readme → Seeding).';
        }

        // Anything a real install would have entered — the demo must never mix into it.
        $businessData = [Employee::class, Vendor::class, Asset::class, Contract::class, StockItem::class, Ticket::class, ServiceRequest::class];
        $inUse = collect($businessData)->contains(fn (string $model) => $model::query()->exists());
        if ($inUse || User::where('username', '!=', 'admin')->exists()) {
            return 'DemoSeeder runs on an empty install only - this one already holds data. '
                .'Reset with `php artisan migrate:fresh` and the standard seed first.';
        }

        return null;
    }

    /**
     * Runs the given steps in one transaction with the queue faked and the clock restored
     * afterwards, whatever happens. Public so a test can append a failing step.
     *
     * @param  list<class-string<DemoStep>>  $steps
     */
    public function runSteps(array $steps): DemoContext
    {
        Queue::fake();
        $ctx = new DemoContext;
        $clock = new DemoClock;

        try {
            DB::transaction(function () use ($steps, $ctx, $clock) {
                foreach ($steps as $step) {
                    $this->command?->info('Demo: '.class_basename($step));
                    app($step)->run($ctx, $clock);
                }
            });
        } finally {
            $clock->reset();
            Auth::forgetUser();
        }

        return $ctx;
    }

    private function printAccounts(DemoContext $ctx): void
    {
        $rows = collect($ctx->users)->map(fn (User $user) => [
            $user->username,
            self::PASSWORD,
            $user->employee?->name,
            $user->employee?->position?->title,
            $user->role?->name,
        ])->values()->all();

        $this->command?->table(['Username', 'Password', 'Name', 'Position', 'Role'], $rows);
    }
}
