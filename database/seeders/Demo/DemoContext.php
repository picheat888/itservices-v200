<?php

namespace Database\Seeders\Demo;

use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Contract\Contract;
use App\Models\Employee\Employee;
use App\Models\Settings\AssetModel;
use App\Models\Settings\Location;
use App\Models\Settings\Vendor;
use App\Models\Stock\StockItem;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use RuntimeException;

/**
 * What the demo has created so far, by a short key ('staff', 'sup', 'it.tech',
 * 'laptop-rental'…), so later steps can refer to earlier ones without re-querying.
 * Also switches the acting user, because audit rows and controller actions read it,
 * and writes the audit rows the controllers would have written.
 */
final class DemoContext
{
    /** @var array<string, Employee> */
    public array $employees = [];

    /** @var array<string, User> */
    public array $users = [];

    /** @var array<string, Vendor> */
    public array $vendors = [];

    /** @var array<string, AssetModel> */
    public array $models = [];

    /** @var array<string, Location> */
    public array $locations = [];

    /** @var array<string, Contract> */
    public array $contracts = [];

    /** @var array<string, Asset> */
    public array $assets = [];

    /** @var array<string, StockItem> */
    public array $items = [];

    /** @var array<string, Model> */
    public array $resources = [];

    public function employee(string $key): Employee
    {
        return $this->employees[$key] ?? throw new RuntimeException("Demo employee '{$key}' was never created.");
    }

    public function user(string $key): User
    {
        return $this->users[$key] ?? throw new RuntimeException("Demo account '{$key}' was never created.");
    }

    public function actAs(User $user): void
    {
        Auth::setUser($user);
    }

    /** Acts as this employee's demo login, or as nobody ("System") when they have none. */
    public function actAsEmployee(Employee $employee): void
    {
        foreach ($this->users as $user) {
            if ((int) $user->employee_id === (int) $employee->id) {
                $this->actAs($user);

                return;
            }
        }

        Auth::forgetUser();
    }

    /**
     * The audit row the screen would have written for this action. The demo calls the
     * services directly and the app records audit rows in its controllers, so each step
     * records the same action names itself — as whoever is acting at that moment.
     *
     * @param  array<string, mixed>|null  $details
     */
    public function audit(string $action, ?string $target = null, ?array $details = null): void
    {
        AuditLog::record($action, $target, $details);
    }
}
