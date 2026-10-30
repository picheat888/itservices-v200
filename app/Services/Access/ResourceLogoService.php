<?php

// The logo of a software or social platform record: a new upload replaces the old file, "remove" deletes it.

namespace App\Services\Access;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class ResourceLogoService
{
    /**
     * The validated data with `logo` / `remove_logo` turned into `logo_path`, deleting the previous file when replaced or removed.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function apply(array $data, ?UploadedFile $logo, string $folder, ?string $oldPath = null): array
    {
        $remove = (bool) ($data['remove_logo'] ?? false);
        unset($data['logo'], $data['remove_logo']);

        if ($logo !== null) {
            if ($oldPath) {
                Storage::disk('local')->delete($oldPath);
            }
            $data['logo_path'] = $logo->store($folder, 'local');
        } elseif ($remove && $oldPath) {
            Storage::disk('local')->delete($oldPath);
            $data['logo_path'] = null;
        }

        return $data;
    }
}
