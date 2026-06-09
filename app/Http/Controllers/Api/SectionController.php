<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSectionRequest;
use App\Http\Resources\SectionResource;
use App\Models\AuditLog;
use App\Models\Section;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SectionController extends Controller
{
    /**
     * List all sections, optionally filtered by department_id, with employee count.
     */
    public function index(Request $request): JsonResponse
    {
        $query = Section::with('department')->withCount('employees')
            ->orderBy('department_id')->orderBy('name');

        if ($request->filled('department_id')) {
            $query->where('department_id', (int) $request->query('department_id'));
        }

        return SectionResource::collection($query->get())->response();
    }

    /**
     * Create a new section.
     */
    public function store(StoreSectionRequest $request): JsonResponse
    {
        $section = Section::create($request->validated());
        AuditLog::record('Created section', $section->name);

        return (new SectionResource($section->load('department')))->additional(['message' => 'success'])->response()->setStatusCode(201);
    }

    /**
     * Update an existing section.
     */
    public function update(StoreSectionRequest $request, Section $section): JsonResponse
    {
        $before = $section->getOriginal();
        $section->update($request->validated());
        AuditLog::record('Updated section', $section->name, AuditLog::changes($before, $section));

        return (new SectionResource($section->load('department')))->additional(['message' => 'success'])->response();
    }

    /**
     * Delete a section. Requires org-manage permission.
     */
    public function destroy(Request $request, Section $section): JsonResponse
    {
        abort_unless((bool) $request->user()?->canManageOrg(), 403);
        AuditLog::record('Deleted section', $section->name);
        $section->delete();

        return response()->json(['message' => 'success']);
    }
}
