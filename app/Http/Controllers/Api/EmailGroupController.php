<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreEmailGroupRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\EmailGroupResource;
use App\Models\AccessMembership;
use App\Models\EmailGroup;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class EmailGroupController extends Controller
{
    /** List all email groups (with department + owner). */
    public function index(): JsonResponse
    {
        return EmailGroupResource::collection(EmailGroup::with(['department', 'owner'])->orderBy('code')->get())->response();
    }

    /** Create a new email group. */
    public function store(StoreEmailGroupRequest $request): JsonResponse
    {
        $g = EmailGroup::create($request->validated());

        return (new EmailGroupResource($g))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing email group. */
    public function update(StoreEmailGroupRequest $request, EmailGroup $emailGroup): JsonResponse
    {
        $emailGroup->update($request->validated());

        return (new EmailGroupResource($emailGroup))->additional(['message' => 'success'])->response();
    }

    /** Delete an email group, guarding against active members. */
    public function destroy(EmailGroup $emailGroup): JsonResponse
    {
        if ($emailGroup->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $emailGroup->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members of an email group. */
    public function members(EmailGroup $emailGroup): JsonResponse
    {
        $members = $emailGroup->memberships()->active()->with('employee')->get();

        return AccessMembershipResource::collection($members)->response();
    }

    /** Grant an employee access to the email group. */
    public function addMember(StoreAccessMembershipRequest $request, EmailGroup $emailGroup, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($emailGroup, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the email group. */
    public function revokeMember(EmailGroup $emailGroup, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
