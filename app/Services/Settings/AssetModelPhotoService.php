<?php

// The photo of an asset model: a new upload replaces the old file, "remove" deletes it.

namespace App\Services\Settings;

use App\Models\Settings\AssetModel;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Throwable;

class AssetModelPhotoService
{
    private const FOLDER = 'model-photos';

    /**
     * Save the model with the validated data, turning `photo` / `remove_photo` into `photo_path`.
     * The new file is stored first and the old one deleted only once the row is saved, so a failed
     * save keeps the photo it had and leaves no stray file behind. Data without either key leaves the photo alone.
     *
     * @param  array<string, mixed>  $data
     */
    public function save(AssetModel $model, array $data, ?UploadedFile $photo): AssetModel
    {
        $oldPath = $model->photo_path;
        $remove = (bool) ($data['remove_photo'] ?? false);
        unset($data['photo'], $data['remove_photo']);

        $newPath = $photo?->store(self::FOLDER, 'local');
        if ($newPath !== null) {
            $data['photo_path'] = $newPath;
        } elseif ($remove) {
            $data['photo_path'] = null;
        }

        try {
            $model->fill($data)->save();
        } catch (Throwable $e) {
            $this->delete($newPath);
            throw $e;
        }

        if ($oldPath !== null && $oldPath !== $model->photo_path) {
            $this->delete($oldPath);
        }

        return $model;
    }

    /** Remove a stored photo file; a null path is a no-op. */
    public function delete(?string $path): void
    {
        if ($path) {
            Storage::disk('local')->delete($path);
        }
    }
}
