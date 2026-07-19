<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreEmailGroupRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\EmailGroupResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\EmailGroup;
use App\Models\AuditLog;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmailGroupController extends Controller
{
    /** List all email groups (with department + owner). */
    public function index(): JsonResponse
    {
        return EmailGroupResource::collection(EmailGroup::with(['department', 'owner', 'memberships' => fn ($q) => $q->active()->with('employee')])->orderBy('code')->get())->response();
    }

    /** Create a new email group. */
    public function store(StoreEmailGroupRequest $request): JsonResponse
    {
        $g = EmailGroup::create($request->validated());
        AuditLog::record('Created email group', $g->name);

        return (new EmailGroupResource($g))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing email group. */
    public function update(StoreEmailGroupRequest $request, EmailGroup $emailGroup): JsonResponse
    {
        $before = $emailGroup->getOriginal();
        $emailGroup->update($request->validated());
        AuditLog::record('Updated email group', $emailGroup->name, AuditLog::changes($before, $emailGroup));

        return (new EmailGroupResource($emailGroup))->additional(['message' => 'success'])->response();
    }

    /** Delete an email group, guarding against active members. */
    public function destroy(EmailGroup $emailGroup): JsonResponse
    {
        if ($emailGroup->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        AuditLog::record('Deleted email group', $emailGroup->name);
        $emailGroup->delete();

        return response()->json(['message' => 'success']);
    }

    /**
     * Set (or clear) the group's owner — the approver used by the Request/Approval
     * workflow. The owner is a single-valued attribute of the group (separate from
     * the member list in access_memberships), managed here rather than on the edit form.
     */
    public function setOwner(Request $request, EmailGroup $emailGroup, AccessService $svc): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('access.manage'), 403);
        // Owner is mandatory for an email group — changing it always sets a real employee.
        $data = $request->validate([
            'owner_employee_id' => ['required', 'integer', 'exists:employees,id'],
        ]);
        $svc->setOwner($emailGroup, $data['owner_employee_id']);
        $emailGroup->load('owner');
        AuditLog::record('Changed email group owner', $emailGroup->name, ['owner' => $emailGroup->owner?->name]);

        return (new EmailGroupResource($emailGroup))->additional(['message' => 'success'])->response();
    }

    /** List the active members of an email group. */
    public function members(EmailGroup $emailGroup): JsonResponse
    {
        $members = $emailGroup->memberships()->active()->with(['employee', 'grantedBy'])->get();

        return AccessMembershipResource::collection($members)->response();
    }

    /** Grant an employee access to the email group. */
    public function addMember(StoreAccessMembershipRequest $request, EmailGroup $emailGroup, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($emailGroup, (int) $data['employee_id'], $data);
        AuditLog::record('Added member to email group', $emailGroup->name, ['employee' => $m->employee?->name]);

        return (new AccessMembershipResource($m->load('employee', 'grantedBy')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the email group. */
    public function revokeMember(EmailGroup $emailGroup, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        AuditLog::record('Removed member from email group', $emailGroup->name, ['employee' => $membership->employee?->name]);
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
