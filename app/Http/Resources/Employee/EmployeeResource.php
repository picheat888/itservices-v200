<?php

namespace App\Http\Resources\Employee;

use App\Enums\Employee\EmployeeStatus;
use App\Models\Employee\Employee;
use App\Services\Employee\EmployeeService;
use App\Support\SuperAdmins;
use App\Support\SystemTime;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Employee */
class EmployeeResource extends JsonResource
{
    /**
     * Reads the Super admin flag for the whole list in one go, see Employee::rememberSuperAdmin().
     *
     * @param  mixed  $resource
     */
    public static function collection($resource): AnonymousResourceCollection
    {
        $employees = collect($resource)->filter(fn (mixed $item) => $item instanceof Employee);
        $protectedIds = array_flip(SuperAdmins::protectedEmployeeIds($employees->pluck('id')->all()));
        $employees->each(fn (Employee $employee) => $employee->rememberSuperAdmin(isset($protectedIds[$employee->id])));

        return parent::collection($resource);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $status = $this->status instanceof EmployeeStatus ? $this->status : EmployeeStatus::tryFrom((string) $this->status);

        // Linked login account, read once
        $linkedUser = $this->user;

        // Contact details, login name, joining date and why someone left are Employee-module
        // data. The unpaged list stays open as the picker every other module uses, so for a
        // reader without employees.view those fields go out empty — except on their own record.
        $viewer = $request->user();
        $showsPersonal = (bool) $viewer?->hasPermission('employees.view')
            || ($viewer?->employee_id !== null && (int) $viewer->employee_id === (int) $this->id);
        $personal = fn (mixed $value): mixed => $showsPersonal ? $value : null;

        return [
            'id' => $this->id,
            'code' => $this->code,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'first_name_th' => $this->first_name_th,
            'last_name_th' => $this->last_name_th,
            // Composed full names (read-only accessors) for display convenience.
            'name' => $this->name,
            'name_th' => $this->name_th,
            'photo_url' => $this->photo_url,
            'department_id' => $this->department_id,
            'position_id' => $this->position_id,
            'manager_id' => $this->manager_id,
            'manager_name' => $this->whenLoaded('manager', fn () => $this->manager?->name),
            'manager_name_th' => $this->whenLoaded('manager', fn () => $this->manager?->name_th),
            'department' => $this->whenLoaded('department', fn () => $this->department?->name),
            'department_th' => $this->whenLoaded('department', fn () => $this->department?->name_th),
            'section_id' => $this->section_id,
            'section' => $this->whenLoaded('section', fn () => $this->section?->name),
            'section_th' => $this->whenLoaded('section', fn () => $this->section?->name_th),
            'position' => $this->whenLoaded('position', fn () => $this->position?->title),
            'email' => $personal($this->email),
            'phone' => $personal($this->phone),
            'username' => $personal($this->username),
            'joined_at' => $personal($this->joined_at?->toDateString()),
            'status' => $status?->value ?? EmployeeStatus::Active->value,
            'resign_reason' => $personal($this->resign_reason),
            'last_day' => $personal($this->last_day?->toDateString()),
            'has_account' => (bool) $linkedUser,
            'is_super_admin' => $this->resource->isSuperAdmin(),
            // When and by whom it was added / last changed. The names ride on the single-record endpoint only.
            'created_at' => SystemTime::date($this->created_at),
            'updated_at' => SystemTime::date($this->updated_at),
            'created_by_name' => $this->whenLoaded('creator', fn () => $this->creator?->name),
            'created_by_name_th' => $this->whenLoaded('creator', fn () => $this->creator?->name_th),
            'updated_by_name' => $this->whenLoaded('updater', fn () => $this->updater?->name),
            'updated_by_name_th' => $this->whenLoaded('updater', fn () => $this->updater?->name_th),
            // Why this record cannot be deleted — empty means it is a clean mis-entry. Costs a
            // handful of existence checks, so it rides along only on the single-employee
            // endpoint, which is what the detail drawer (and its Delete button) reads.
            'delete_blockers' => $this->when(
                // apiResource names this one `employees.show` — the hand-written employee
                // routes carry the `api.` prefix, the resource ones do not.
                $request->routeIs('employees.show'),
                fn () => app(EmployeeService::class)->deletionBlockers($this->resource),
            ),
        ];
    }
}
