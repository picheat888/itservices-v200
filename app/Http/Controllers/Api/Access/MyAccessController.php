<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Resources\Access\EmployeeAccessResource;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * What the signed-in person may reach — the lower half of the self-service page.
 *
 * Deliberately outside the Access Directory's route group: every read in there answers to
 * `access.module`, the right to browse the registry of who-can-reach-what across the company.
 * Seeing your own accounts is not that, so this hangs off `access.my`, which the permission
 * matrix shows beside "my assets" and which the master never switches off.
 *
 * Same service and same resource the Employee detail's Access tab uses, so the two screens
 * can never disagree about what somebody holds — only about who is allowed to ask.
 */
class MyAccessController extends Controller
{
    public function index(Request $request, AccessService $accessService): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('access.my'), 403);

        $employee = $request->user()?->linkedEmployee();

        // No employee record means nothing is granted to anybody by this name. The page still
        // has to render — it is where somebody would go to find out they are not linked yet.
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
