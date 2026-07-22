<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Resources\Access\EmployeeAccessResource;
use App\Models\Employee\Employee;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;

class AccessController extends Controller
{
    /** Return an employee's active access memberships grouped by resource type. */
    public function employee(Employee $employee, AccessService $svc): JsonResponse
    {
        $grouped = $svc->employeeAccess($employee);
        // Let the resource flag rows this employee owns (approver / share owner).
        $grouped['employee_id'] = $employee->id;
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty()
                || $grouped['social_platform']->isNotEmpty() || $grouped['software']->isNotEmpty());

        return (new EmployeeAccessResource($grouped))->response();
    }

    /** Aggregate figures for the Access Directory overview tab. */
    public function dashboard(AccessService $svc): JsonResponse
    {
        return response()->json(['data' => $svc->dashboard()]);
    }
}
