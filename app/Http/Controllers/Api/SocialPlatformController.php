<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreAccessMembershipRequest;
use App\Http\Requests\StoreSocialPlatformRequest;
use App\Http\Resources\AccessMembershipResource;
use App\Http\Resources\SocialPlatformResource;
use App\Models\AccessMembership;
use App\Models\SocialPlatform;
use App\Services\AccessService;
use Illuminate\Http\JsonResponse;

class SocialPlatformController extends Controller
{
    /** List all social/internet platforms. */
    public function index(): JsonResponse
    {
        return SocialPlatformResource::collection(SocialPlatform::orderBy('code')->get())->response();
    }

    /** Create a new social platform. */
    public function store(StoreSocialPlatformRequest $request): JsonResponse
    {
        $sp = SocialPlatform::create($request->validated());

        return (new SocialPlatformResource($sp))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing social platform. */
    public function update(StoreSocialPlatformRequest $request, SocialPlatform $socialPlatform): JsonResponse
    {
        $socialPlatform->update($request->validated());

        return (new SocialPlatformResource($socialPlatform))->additional(['message' => 'success'])->response();
    }

    /** Delete a social platform, guarding against active members. */
    public function destroy(SocialPlatform $socialPlatform): JsonResponse
    {
        if ($socialPlatform->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        $socialPlatform->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members of a social platform. */
    public function members(SocialPlatform $socialPlatform): JsonResponse
    {
        return AccessMembershipResource::collection($socialPlatform->memberships()->active()->with('employee')->get())->response();
    }

    /** Grant an employee access to the social platform (null access level). */
    public function addMember(StoreAccessMembershipRequest $request, SocialPlatform $socialPlatform, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($socialPlatform, (int) $data['employee_id'], $data);

        return (new AccessMembershipResource($m->load('employee')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the social platform. */
    public function revokeMember(SocialPlatform $socialPlatform, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
