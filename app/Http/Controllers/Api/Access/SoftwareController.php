<?php

namespace App\Http\Controllers\Api\Access;

use App\Http\Controllers\Controller;
use App\Http\Requests\Access\StoreAccessMembershipRequest;
use App\Http\Requests\Access\StoreSoftwareRequest;
use App\Http\Resources\Access\AccessMembershipResource;
use App\Http\Resources\Access\SoftwareResource;
use App\Models\Access\AccessMembership;
use App\Models\Access\Software;
use App\Models\AuditLog;
use App\Services\Access\AccessService;
use App\Services\Access\ResourceLogoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SoftwareController extends Controller
{
    public function __construct(private ResourceLogoService $logos) {}

    /** List all software with the first few active members and the seat count. */
    public function index(): JsonResponse
    {
        return SoftwareResource::collection(
            Software::with(['memberships' => fn ($q) => $q->active()->with('employee')->orderBy('id')->limit(SoftwareResource::PREVIEW_MEMBERS), 'brand', 'creator.employee', 'updater.employee'])
                ->withCount(['memberships as members_count' => fn ($q) => $q->active()])->orderBy('code')->get()
        )->response();
    }

    /** Create a new software entry. */
    public function store(StoreSoftwareRequest $request): JsonResponse
    {
        $sw = Software::create($this->logos->apply($request->safe()->except('seats_unlimited'), $request->file('logo'), 'software-logos'));
        AuditLog::record('Created software', $sw->name, subject: $sw);

        return (new SoftwareResource($sw))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Update an existing software entry. */
    public function update(StoreSoftwareRequest $request, Software $software, AccessService $svc): JsonResponse
    {
        $before = $software->getOriginal();
        DB::transaction(function () use ($request, $software, $svc): void {
            $svc->guardSeatCount($software, $request->validated('seats'));
            $software->update($this->logos->apply($request->safe()->except('seats_unlimited'), $request->file('logo'), 'software-logos', $software->logo_path));
        });
        AuditLog::record('Updated software', $software->name, $this->auditChanges($before, $software), subject: $software);

        return (new SoftwareResource($software))->additional(['message' => 'success'])->response();
    }

    /**
     * Audit diff with the product key masked: the log only says it changed, never the key.
     *
     * @param  array<string, mixed>  $before
     * @return array<string, mixed>|null
     */
    private function auditChanges(array $before, Software $software): ?array
    {
        $changes = AuditLog::changes($before, $software, ['product_key']);
        if ($software->wasChanged('product_key')) {
            $mask = fn (mixed $key): ?string => filled($key) ? '••••' : null;
            $changes['changes']['product_key'] = ['from' => $mask($before['product_key'] ?? null), 'to' => $mask($software->product_key)];
        }

        return $changes;
    }

    /** Delete a software entry, guarding against active members. */
    public function destroy(Software $software): JsonResponse
    {
        if ($software->memberships()->active()->exists()) {
            return response()->json(['message' => 'resource_has_members'], 422);
        }
        AuditLog::recordDeleted('Deleted software', $software->name, $software);
        $software->delete();

        return response()->json(['message' => 'success']);
    }

    /** List the active members (licence holders) of a software entry. */
    public function members(Software $software): JsonResponse
    {
        return AccessMembershipResource::collection($software->memberships()->active()->with(['employee', 'grantedBy'])->get())->response();
    }

    /** Grant an employee a licence for the software. */
    public function addMember(StoreAccessMembershipRequest $request, Software $software, AccessService $svc): JsonResponse
    {
        $data = $request->validated();
        $m = $svc->grant($software, (int) $data['employee_id'], $data);
        AuditLog::record('Added member to software', $software->name, ['employee' => $m->employee?->name], subject: $software);

        return (new AccessMembershipResource($m->load('employee', 'grantedBy')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /** Soft-revoke an employee's licence. */
    public function revokeMember(Software $software, AccessMembership $membership, AccessService $svc): JsonResponse
    {
        if ($membership->revoked_at !== null) {
            return response()->json(['message' => 'success']);
        }

        AuditLog::record('Removed member from software', $software->name, ['employee' => $membership->employee?->name], subject: $software);
        $svc->revoke($membership);

        return response()->json(['message' => 'success']);
    }
}
