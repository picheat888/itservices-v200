<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\EmployeeAccessResource;
use App\Models\Employee;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class AccessController extends Controller
{
    /** Return an employee's active access memberships grouped by resource type. */
    public function employee(Employee $employee, AccessService $svc): JsonResponse
    {
        $grouped = $svc->employeeAccess($employee);
        $grouped['outstanding'] = $employee->status?->value === 'resigned'
            && ($grouped['email_group']->isNotEmpty() || $grouped['file_share']->isNotEmpty() || $grouped['social_platform']->isNotEmpty());

        return (new EmployeeAccessResource($grouped))->response();
    }
}
