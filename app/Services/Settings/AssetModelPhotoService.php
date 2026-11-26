<?php

// The photo of an asset model: a new upload replaces the old file, "remove" deletes it.

namespace App\Services\Settings;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

class AssetModelPhotoService
{
    private const FOLDER = 'model-photos';

    /**
     * The validated data with `photo` / `remove_photo` turned into `photo_path`, deleting the previous file when replaced or removed.
     * Data without either key leaves `photo_path` untouched.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function apply(array $data, ?UploadedFile $photo, ?string $oldPath = null): array
    {
        $remove = (bool) ($data['remove_photo'] ?? false);
        unset($data['photo'], $data['remove_photo']);

        if ($photo !== null) {
            $this->delete($oldPath);
            $data['photo_path'] = $photo->store(self::FOLDER, 'local');
        } elseif ($remove && $oldPath) {
            $this->delete($oldPath);
            $data['photo_path'] = null;
        }

        return $data;
    }

    /** Remove a stored photo file; a null path is a no-op. */
    public function delete(?string $path): void
    {
        if ($path) {
            Storage::disk('local')->delete($path);
        }
    }
}
