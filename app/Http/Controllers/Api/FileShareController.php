<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreFileShareRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\FileShareResource;
use App\Models\AccessMembership;
use App\Models\FileShare;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class FileShareController extends Controller
{
    /** List all file shares (with department + owner). */
    public function index(): JsonResponse
    {
        return FileShareResource::collection(FileShare::with(['department', 'owner'])->orderBy('code')->get())->response();
    }

    /** Create a new file share. */
    public function store(StoreFileShareRequest $request): JsonResponse
    {
        $fs = FileShare::create($request->validated());

        return (new FileShareResource($fs))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing file share. */
    public function update(StoreFileShareRequest $request, FileShare $fileShare): JsonResponse
    {
        $fileShare->update($request->validated());

        return (new FileShareResource($fileShare))->additional(['message' => 'success'])->response();
    }

    /** Delete a file share, guarding against active members. */
    public function destroy(FileShare $fileShare): JsonResponse
    {
        if ($fileShare->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $fileShare->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members of a file share. */
    public function members(FileShare $fileShare): JsonResponse
    {
        return AccessMembershipResource::collection($fileShare->memberships()->active()->with('employee')->get())->response();
    }

    /** Grant an employee access to the file share. */
    public function addMember(StoreAccessMembershipRequest $request, FileShare $fileShare, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($fileShare, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the file share. */
    public function revokeMember(FileShare $fileShare, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
