<?php

// Test helpers for the asset import: build an uploaded .xlsx from rows, read a downloaded .xlsx back.

namespace Tests\Concerns;

use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;

trait MakesXlsxUploads
{
    /** @param  array<string, list<list<mixed>>>  $sheets  title => rows */
    protected function xlsxUpload(array $sheets, string $name = 'assets.xlsx'): UploadedFile
    {
        $book = new Spreadsheet;
        $book->removeSheetByIndex(0);
        foreach ($sheets as $title => $rows) {
            $sheet = $book->createSheet();
            $sheet->setTitle((string) $title);
            $sheet->fromArray($rows, null, 'A1', true);
        }
        if ($book->getSheetCount() === 0) {
            $book->createSheet();
        }

        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        IOFactory::createWriter($book, 'Xlsx')->save($path);

        return new UploadedFile($path, $name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    protected function xlsxFromResponse(TestResponse $response): Spreadsheet
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        file_put_contents($path, $response->streamedContent());

        return IOFactory::load($path);
    }
}
