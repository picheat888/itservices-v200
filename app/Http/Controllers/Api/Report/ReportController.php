<?php

namespace App\Http\Controllers\Api\Report;

use App\Http\Controllers\Controller;
use App\Services\Report\ReportPinService;
use App\Services\Report\ReportSnapshotService;
use App\Support\ReportCatalogue;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Report Center (/reports): the reports this reader may open (each flagged when pinned),
 * the number strip on top, and pinning.
 *
 * No route-level permission: an empty list is the honest answer for someone who holds
 * none, and the page shows its own empty state for it.
 */
class ReportController extends Controller
{
    public function __construct(private ReportPinService $pins) {}

    public function index(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->pins->catalogueFor($request->user())]);
    }

    public function snapshot(Request $request, ReportSnapshotService $snapshot): JsonResponse
    {
        $validated = $request->validate([
            'period' => ['nullable', Rule::in(ReportSnapshotService::PERIODS)],
            'from' => ['required_if:period,custom', 'nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'to' => ['required_if:period,custom', 'nullable', 'date_format:Y-m-d', 'after_or_equal:from', 'before_or_equal:today'],
        ]);
        $period = $validated['period'] ?? '30d';

        return response()->json(['data' => $snapshot->for(
            $request->user(),
            $period,
            $period === 'custom' ? $validated['from'] : null,
            $period === 'custom' ? $validated['to'] : null,
        )]);
    }

    public function pin(Request $request, string $key): JsonResponse
    {
        $this->authorizeReport($request, $key);
        $this->pins->pin($request->user(), $key);

        return response()->json(['data' => ['key' => $key, 'pinned' => true], 'message' => 'success']);
    }

    public function unpin(Request $request, string $key): JsonResponse
    {
        $this->authorizeReport($request, $key);
        $this->pins->unpin($request->user(), $key);

        return response()->json(['data' => ['key' => $key, 'pinned' => false], 'message' => 'success']);
    }

    /** Unknown report → 404; one the reader may not open → 403. */
    private function authorizeReport(Request $request, string $key): void
    {
        abort_unless(array_key_exists($key, ReportCatalogue::definitions()), 404);
        abort_unless(ReportCatalogue::allows($request->user(), $key), 403);
    }
}
