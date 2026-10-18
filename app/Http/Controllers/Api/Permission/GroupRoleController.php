<?php

namespace App\Http\Controllers\Api\Permission;

use App\Http\Controllers\Controller;
use App\Http\Requests\Permission\GroupRoleCandidatesRequest;
use App\Http\Requests\Permission\GroupRoleMembersRequest;
use App\Http\Requests\Permission\ManageGroupsRequest;
use App\Http\Requests\Permission\SetDefaultGroupRequest;
use App\Http\Requests\Permission\StoreGroupRoleRequest;
use App\Http\Requests\Permission\UpdateGroupRoleRequest;
use App\Http\Resources\Permission\GroupRoleMemberResource;
use App\Http\Resources\Permission\GroupRoleResource;
use App\Models\Permission\GroupRole;
use App\Services\Permission\GroupRoleGuards;
use App\Services\Permission\GroupRoleMemberService;
use App\Services\Permission\GroupRoleService;
use App\Services\Permission\RoleOptionService;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GroupRoleController extends Controller
{
    public function index(ManageGroupsRequest $request, GroupRoleService $groups, RoleOptionService $roleOptions): JsonResponse
    {
        $mine = $groups->groupIdsOf($request->user());

        return response()->json([
            'data' => $groups->all()->map(fn (GroupRole $group) => new GroupRoleResource($group, $mine)),
            'default_group_id' => GroupRole::defaultForNewEmployees()?->id,
            // The roles a group can be given, for the group dialog
            'roles' => $roleOptions->options(),
        ]);
    }

    public function store(StoreGroupRoleRequest $request, GroupRoleService $groups): JsonResponse
    {
        $group = $groups->create($request->user(), $request->validated());

        return response()->json([
            'data' => new GroupRoleResource($group->load('role'), $groups->groupIdsOf($request->user())),
            'message' => 'success',
        ], 201);
    }

    public function update(UpdateGroupRoleRequest $request, GroupRole $groupRole, GroupRoleService $groups): JsonResponse
    {
        $group = $groups->update($request->user(), $groupRole, $request->validated());

        return response()->json([
            'data' => new GroupRoleResource($group->load('role')->loadCount('employees'), $groups->groupIdsOf($request->user())),
            'message' => 'success',
        ]);
    }

    public function destroy(ManageGroupsRequest $request, GroupRole $groupRole, GroupRoleService $groups): JsonResponse
    {
        $groups->delete($request->user(), $groupRole);

        return response()->json(['message' => 'success']);
    }

    /** Sets the default Role Group for new employees, then answers with the whole list. */
    public function setDefaultGroup(SetDefaultGroupRequest $request, GroupRoleService $groups, RoleOptionService $roleOptions): JsonResponse
    {
        $groups->setDefault($request->user(), $request->groupId());

        return $this->index($request, $groups, $roleOptions);
    }

    /** One page of the group's members for the dialog. */
    public function members(GroupRoleMembersRequest $request, GroupRole $groupRole, GroupRoleMemberService $service, GroupRoleGuards $guards): JsonResponse
    {
        return $this->memberPage($request, $guards, $service->members($groupRole, $request->search(), $request->perPage()));
    }

    /** People who can join a group (or a new one): one page, or a whole department with all=1. */
    public function candidates(GroupRoleCandidatesRequest $request, GroupRoleMemberService $service, GroupRoleGuards $guards): JsonResponse
    {
        $group = $request->group();
        $departmentId = $request->departmentId();

        $page = $service->candidates($group, $request->search(), $departmentId, $request->wantsWholeDepartment(), $request->perPage());
        // For "Everyone in {dept} (n)": who this caller may actually add
        $extraMeta = $departmentId !== null
            ? ['addable' => $service->addableCount($group, $request->search(), $departmentId, $request->user())]
            : [];

        return $this->memberPage($request, $guards, $page, $extraMeta);
    }

    /**
     * @param  array<string, mixed>  $extraMeta
     */
    private function memberPage(Request $request, GroupRoleGuards $guards, LengthAwarePaginator $page, array $extraMeta = []): JsonResponse
    {
        // GroupRoleMemberResource reads the Super-admin rows the caller may not move, and the caller's own employee
        $request->attributes->set('protected_employee_ids', array_map('intval', $guards->protectedFrom($request->user(), collect($page->items())->pluck('id')->all())));
        $request->attributes->set('my_employee_ids', $request->user()->linkedEmployeeIds());

        return response()->json([
            'data' => GroupRoleMemberResource::collection($page->items())->resolve($request),
            'meta' => [
                'total' => $page->total(),
                'per_page' => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                ...$extraMeta,
            ],
        ]);
    }
}
