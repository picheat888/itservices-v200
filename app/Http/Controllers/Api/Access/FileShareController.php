<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreFileShareRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\FileShareResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\FileShare;
use App\Models\AuditLog;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FileShareController extends Controller
{
    /** List all file shares (with department + owner). */
    public function index(): JsonResponse
    {
        return FileShareResource::collection(FileShare::with(['department', 'owner', 'memberships' => fn ($q) => $q->active()->with('employee')])->orderBy('code')->get())->response();
    }

    /** Create a new file share. */
    public function store(StoreFileShareRequest $request): JsonResponse
    {
        $fs = FileShare::create($request->validated());
        AuditLog::record('Created file share', $fs->name);

        return (new FileShareResource($fs))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing file share. */
    public function update(StoreFileShareRequest $request, FileShare $fileShare): JsonResponse
    {
        $before = $fileShare->getOriginal();
        $fileShare->update($request->validated());
        AuditLog::record('Updated file share', $fileShare->name, AuditLog::changes($before, $fileShare));

        return (new FileShareResource($fileShare))->additional(['message' => 'success'])->response();
    }

    /** Delete a file share, guarding against active members. */
    public function destroy(FileShare $fileShare): JsonResponse
    {
        if ($fileShare->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        AuditLog::record('Deleted file share', $fileShare->name);
        $fileShare->delete();

        return response()->json(['message' => 'success']);
    }

    /**
     * Set or clear the file share's owner from the members drawer. The owner is a
     * single-valued attribute of the share (separate from the member list); it is
     * required at creation but, unlike email groups, can be cleared afterwards.
     */
    public function setOwner(Request $request, FileShare $fileShare, AccessService $svc): JsonResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('access.file_edit'), 403);
        $data = $request->validate([
            'owner_employee_id' => ['nullable', 'integer', 'exists:employees,id'],
        ]);
        $svc->setOwner($fileShare, $data['owner_employee_id'] ?? null);
        $fileShare->load('owner');
        AuditLog::record('Changed file share owner', $fileShare->name, ['owner' => $fileShare->owner?->name]);

        return (new FileShareResource($fileShare))->additional(['message' => 'success'])->response();
    }

    /** List the active members of a file share. */
    public function members(FileShare $fileShare): JsonResponse
    {
        return AccessMembershipResource::collection($fileShare->memberships()->active()->with(['employee', 'grantedBy'])->get())->response();
    }

    /** Grant an employee access to the file share. */
    public function addMember(StoreAccessMembershipRequest $request, FileShare $fileShare, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($fileShare, (int) $data['employee_id'], $data);
        AuditLog::record('Added member to file share', $fileShare->name, ['employee' => $m->employee?->name]);

        return (new AccessMembershipResource($m->load('employee', 'grantedBy')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the file share. */
    public function revokeMember(FileShare $fileShare, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        AuditLog::record('Removed member from file share', $fileShare->name, ['employee' => $membership->employee?->name]);
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
