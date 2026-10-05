<?php

namespace App\Http\Controllers\Api\Settings;

use App\Http\Controllers\Controller;
use App\Models\Asset\Asset;
use App\Models\AuditLog;
use App\Models\Settings\WriteoffReason;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Write-off reasons (Settings → Assets). The list is open to every signed-in user — the write-off
 * dialog picks from it — while adding, editing and deleting need settings.assets (routes/api.php).
 */
class WriteoffReasonController extends Controller
{
    /** All reasons, in the order they were added (the standard list first). */
    public function index(): JsonResponse
    {
        return response()->json(['data' => WriteoffReason::orderBy('id')->get(['id', 'name', 'description'])]);
    }

    /** Add a reason. */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:writeoff_reasons,name'],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $reason = WriteoffReason::create($data);
        AuditLog::record('Created write-off reason', $reason->name, subject: $reason);

        return response()->json(['data' => $reason, 'message' => 'success'], 201);
    }

    /** Rename or re-describe a reason — the assets that carry it follow, they link by id. */
    public function update(Request $request, WriteoffReason $writeoffReason): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120', 'unique:writeoff_reasons,name,'.$writeoffReason->id],
            'description' => ['nullable', 'string', 'max:255'],
        ]);
        $before = $writeoffReason->getOriginal();
        $writeoffReason->update($data);
        AuditLog::record('Updated write-off reason', $writeoffReason->name, AuditLog::changes($before, $writeoffReason), subject: $writeoffReason);

        return response()->json(['data' => $writeoffReason, 'message' => 'success']);
    }

    /** Delete a reason — blocked (409) while any asset was written off with it. */
    public function destroy(WriteoffReason $writeoffReason): JsonResponse
    {
        $count = Asset::where('writeoff_reason_id', $writeoffReason->id)->count();
        if ($count > 0) {
            return response()->json(['message' => 'in_use', 'count' => $count], 409);
        }
        AuditLog::recordDeleted('Deleted write-off reason', $writeoffReason->name, $writeoffReason);
        $writeoffReason->delete();

        return response()->json(['message' => 'success']);
    }
}
