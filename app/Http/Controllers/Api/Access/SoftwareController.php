<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreSoftwareRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\SoftwareResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;

class SoftwareController extends Controller
{
    /** List all software with their active members + department. */
    public function index(): JsonResponse
    {
        return SoftwareResource::collection(
            Software::with(['department', 'memberships' => fn ($q) => $q->active()->with('employee')])->orderBy('code')->get()
        )->response();
    }

    /** Create a new software entry. */
    public function store(StoreSoftwareRequest $request): JsonResponse
    {
        $sw = Software::create($request->validated());

        return (new SoftwareResource($sw))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing software entry. */
    public function update(StoreSoftwareRequest $request, Software $software): JsonResponse
    {
        $software->update($request->validated());

        return (new SoftwareResource($software))->additional(['message' => 'success'])->response();
    }

    /** Delete a software entry, guarding against active members. */
    public function destroy(Software $software): JsonResponse
    {
        if ($software->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $software->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members (licence holders) of a software entry. */
    public function members(Software $software): JsonResponse
    {
        return AccessMembershipResource::collection($software->memberships()->active()->with('employee')->get())->response();
    }

    /** Grant an employee a licence for the software. */
    public function addMember(StoreAccessMembershipRequest $request, Software $software, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($software, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke an employee's licence. */
    public function revokeMember(Software $software, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
