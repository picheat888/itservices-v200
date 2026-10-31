<?php

// PDF documents attached to a contract: stored under contracts/{id} on the local disk, at most MAX_FILES per contract.

namespace App\Services\Contract;

use App\Models\Contract\Contract;
use App\Models\Contract\ContractAttachment;
use App\Support\Refusal;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ContractAttachmentService
{
    /** Hard cap on the number of attachments a single contract may hold. */
    public const MAX_FILES = 5;

    /**
     * Store the uploaded PDFs against an open contract, within the per-contract cap.
     *
     * @param  list<UploadedFile>  $files
     *
     * @throws ValidationException
     */
    public function store(Contract $contract, array $files): void
    {
        $this->assertOpen($contract);

        $remaining = self::MAX_FILES - $contract->attachments()->count();
        if (count($files) > $remaining) {
            Refusal::fail('too_many_files', ['max' => self::MAX_FILES, 'remaining' => $remaining]);
        }

        foreach ($files as $file) {
            $path = $file->store("contracts/{$contract->id}", 'local');
            $contract->attachments()->create([
                'original_name' => $file->getClientOriginalName(),
                'path' => $path,
                'size' => $file->getSize(),
                'mime' => $file->getMimeType() ?: 'application/pdf',
            ]);
        }
    }

    /**
     * Delete one attachment of an open contract, file and row.
     *
     * @throws ValidationException
     */
    public function delete(Contract $contract, ContractAttachment $attachment): void
    {
        $this->assertOpen($contract);

        Storage::disk('local')->delete($attachment->path);
        $attachment->delete();
    }

    /** @throws ValidationException */
    public function assertOpen(Contract $contract): void
    {
        if ($contract->isClosed()) {
            Refusal::fail('contract_closed', field: 'contract');
        }
    }
}
