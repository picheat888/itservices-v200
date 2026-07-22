<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreSocialPlatformRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\SocialPlatformResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\SocialPlatform;
use App\Models\AuditLog;
use App\Services\Access\AccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SocialPlatformController extends Controller
{
    /** List all social/internet platforms. */
    public function index(): JsonResponse
    {
        return SocialPlatformResource::collection(SocialPlatform::with(['memberships' => fn ($q) => $q->active()->with('employee')])->orderBy('code')->get())->response();
    }

    /**
     * Pull the uploaded logo (if any) out of the validated data and replace it
     * with a stored path, deleting the previous file when replaced or removed.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function handleLogo(Request $request, array $data, ?string $oldPath = null): array
    {
        $remove = (bool) ($data['remove_logo'] ?? false);
        unset($data['logo'], $data['remove_logo']);

        if ($request->hasFile('logo')) {
            if ($oldPath) {
                Storage::disk('public')->delete($oldPath);
            }
            $data['logo_path'] = $request->file('logo')->store('social-logos', 'public');
        } elseif ($remove && $oldPath) {
            Storage::disk('public')->delete($oldPath);
            $data['logo_path'] = null;
        }

        return $data;
    }

    /** Create a new social platform. */
    public function store(StoreSocialPlatformRequest $request): JsonResponse
    {
        $sp = SocialPlatform::create($this->handleLogo($request, $request->validated()));
        AuditLog::record('Created social platform', $sp->name);

        return (new SocialPlatformResource($sp))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing social platform. */
    public function update(StoreSocialPlatformRequest $request, SocialPlatform $socialPlatform): JsonResponse
    {
        $before = $socialPlatform->getOriginal();
        $socialPlatform->update($this->handleLogo($request, $request->validated(), $socialPlatform->logo_path));
        AuditLog::record('Updated social platform', $socialPlatform->name, AuditLog::changes($before, $socialPlatform));

        return (new SocialPlatformResource($socialPlatform))->additional(['message' => 'success'])->response();
    }

    /** Delete a social platform, guarding against active members. */
    public function destroy(SocialPlatform $socialPlatform): JsonResponse
    {
        if ($socialPlatform->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        AuditLog::record('Deleted social platform', $socialPlatform->name);
        $socialPlatform->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members of a social platform. */
    public function members(SocialPlatform $socialPlatform): JsonResponse
    {
        return AccessMembershipResource::collection($socialPlatform->memberships()->active()->with(['employee', 'grantedBy'])->get())->response();
    }

    /** Grant an employee access to the social platform (null access level). */
    public function addMember(StoreAccessMembershipRequest $request, SocialPlatform $socialPlatform, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($socialPlatform, (int) $data['employee_id'], $data);
        AuditLog::record('Added member to social platform', $socialPlatform->name, ['employee' => $m->employee?->name]);

        return (new AccessMembershipResource($m->load('employee', 'grantedBy')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke a member's access to the social platform. */
    public function revokeMember(SocialPlatform $socialPlatform, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        AuditLog::record('Removed member from social platform', $socialPlatform->name, ['employee' => $membership->employee?->name]);
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
