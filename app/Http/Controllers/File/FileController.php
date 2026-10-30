<?php

namespace App\Http\Controllers\File;

use App\Http\Controllers\Controller;
use App\Models\Access\SocialPlatform;
use App\Models\Access\Software;
use App\Models\Contract\ContractAttachment;
use App\Models\Employee\Employee;
use App\Models\Request\RequestAttachment;
use App\Models\Ticket\TicketAttachment;
use App\Services\Ticket\TicketActionGuard;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Streams uploads from the private 'local' disk, each to whoever may see it; the company logo stays on the public disk. */
class FileController extends Controller
{
    /** A ticket attachment — the ticket's requester or any IT staff (tickets.view_all). */
    public function ticketAttachment(Request $request, TicketAttachment $attachment, TicketActionGuard $guard): StreamedResponse
    {
        abort_if($attachment->ticket === null, 403);
        $guard->canView($request->user(), $attachment->ticket)->authorize();

        return $this->stream($attachment->path, $attachment->original_name, $attachment->mime);
    }

    /** A contract attachment — anyone who can view contracts. */
    public function contractAttachment(Request $request, ContractAttachment $attachment): StreamedResponse
    {
        abort_unless((bool) $request->user()?->hasPermission('contracts.view'), 403);

        return $this->stream($attachment->path, $attachment->original_name, $attachment->mime);
    }

    /** A request attachment — anybody who may open the request it was filed with. */
    public function requestAttachment(Request $request, RequestAttachment $attachment): StreamedResponse
    {
        abort_unless((bool) $attachment->serviceRequest?->isVisibleTo($request->user()), 403);

        return $this->stream($attachment->path, $attachment->original_name, $attachment->mime);
    }

    /** An employee photo — any signed-in user (avatars appear across the whole app). */
    public function employeePhoto(Request $request, Employee $employee): StreamedResponse
    {
        abort_if($request->user() === null, 403);
        abort_if($employee->photo_path === null, 404);

        return $this->stream($employee->photo_path);
    }

    /** A software logo — any signed-in user, like employee photos. */
    public function softwareLogo(Request $request, Software $software): StreamedResponse
    {
        abort_if($request->user() === null, 403);
        abort_if($software->logo_path === null, 404);

        return $this->stream($software->logo_path);
    }

    /** A social-platform logo — any signed-in user, like employee photos. */
    public function socialLogo(Request $request, SocialPlatform $socialPlatform): StreamedResponse
    {
        abort_if($request->user() === null, 403);
        abort_if($socialPlatform->logo_path === null, 404);

        return $this->stream($socialPlatform->logo_path);
    }

    /** Streams a file inline with a short private cache; a missing file is a 404. */
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
