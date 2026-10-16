<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Resources\Access\EmployeeAccessResource;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What the signed-in person may reach — the profile drawer's Access tab.
 * Outside the Access Directory's `access.module` group: a linked employee needs no permission.
 */
class MyAccessController extends Controller
{
    public function index(Request $request, AccessService $accessService): JsonResponse
    {
        $employee = $request->user()?->linkedEmployee();

        // Not linked: every list empty, the tab still renders.
        if ($employee === null) {
            return (new EmployeeAccessResource([
                'email_group' => collect(), 'file_share' => collect(),
                'social_platform' => collect(), 'software' => collect(),
                'employee_id' => null, 'outstanding' => false,
            ]))->response();
        }

        $grouped = $accessService->employeeAccess($employee);
        $grouped['employee_id'] = $employee->id;
        $grouped['outstanding'] = false;

        return (new EmployeeAccessResource($grouped))->response();
    }
}
