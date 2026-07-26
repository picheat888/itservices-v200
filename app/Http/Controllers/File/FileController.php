<?php

namespace App\Http\Controllers\File;

use App\Http\Controllers\Controller;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Contract\ContractAttachment;
use App\Models\Employee\Employee;
use App\Models\Ticket\TicketAttachment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams uploaded files that must NOT be world-readable. The binaries live on
 * the private 'local' disk (no /storage symlink), so the only way in is through
 * these routes — each gated by the same permission that lets a user see the
 * owning record. Loaded fine from <img>/window.open because the browser sends
 * the session cookie on same-origin requests (Sanctum stateful).
 *
 * The company logo is intentionally NOT here — it stays on the public disk so
 * the login page and outgoing emails can show it before/without authentication.
 */
class FileController extends Controller
{
    /** A ticket attachment — the ticket's requester or any IT staff (tickets.view_all). */
    public function ticketAttachment(Request $request, TicketAttachment $attachment): StreamedResponse
    {
        $user = $request->user();
        $ticket = $attachment->ticket;
        abort_unless(
            $user !== null && ($user->hasPermission('tickets.view_all') || $ticket?->requester_id === $user->employee_id),
            403,
        );

        return $this->stream($attachment->path, $attachment->original_name, $attachment->mime);
    }

    /** A contract attachment — anyone who can view contracts. */
    public function contractAttachment(Request $request, ContractAttachment $attachment): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.view'), 403);

        return $this->stream($attachment->path, $attachment->original_name, $attachment->mime);
    }

    /** An employee photo — any signed-in user (avatars appear across the whole app). */
    public function employeePhoto(Request $request, Employee $employee): StreamedResponse
    {
        abort_if($request->user() === null, 403);
        abort_if($employee->photo_path === null, 404);

        return $this->stream($employee->photo_path);
    }

    /** A software logo — gated by the Access module. */
    public function softwareLogo(Request $request, Software $software): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('access.module'), 403);
        abort_if($software->logo_path === null, 404);

        return $this->stream($software->logo_path);
    }

    /** A social-platform logo — gated by the Access module. */
    public function socialLogo(Request $request, SocialPlatform $socialPlatform): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('access.module'), 403);
        abort_if($socialPlatform->logo_path === null, 404);

        return $this->stream($socialPlatform->logo_path);
    }

    /**
     * Streams a file from the private disk inline. 404s a missing path rather
     * than leaking a filesystem error. Cache is private (per-user session) with
     * a short TTL so avatars/logos don't refetch on every render.
     */
    private function stream(?string $path, ?string $downloadName = null, ?string $mime = null): StreamedResponse
    {
        $disk = Storage::disk('local');
        abort_if($path === null || ! $disk->exists($path), 404);

        return $disk->response($path, $downloadName, [
            'Content-Type' => $mime ?: $disk->mimeType($path),
            'Cache-Control' => 'private, max-age=300',
        ]);
    }
}
