<?php

// Test helpers for the asset import: build an uploaded .xlsx from rows, read a downloaded .xlsx back.

namespace Tests\Concerns;

use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use ZipArchive;

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

    /**
     * An upload whose first sheet holds formula cells written the way Excel saves them: the formula with the result it
     * showed beside it. Each cell is [formula without "=", saved result or null when the file holds none, cell type].
     *
     * @param  array<string, list<list<mixed>>>  $sheets  title => rows
     * @param  array<string, array{0: string, 1: ?string, 2?: string}>  $formulas  coordinate on the first sheet => cell
     */
    protected function xlsxWithFormulas(array $sheets, array $formulas): UploadedFile
    {
        $upload = $this->xlsxUpload($sheets);
        $path = $upload->getRealPath();

        $zip = new ZipArchive;
        $zip->open($path);
        $xml = (string) $zip->getFromName('xl/worksheets/sheet1.xml');
        foreach ($formulas as $coordinate => [$formula, $result]) {
            $type = $formulas[$coordinate][2] ?? 'str';
            $cell = "<c r=\"{$coordinate}\" t=\"{$type}\"><f>".htmlspecialchars($formula, ENT_XML1).'</f>'
                .($result === null ? '' : '<v>'.htmlspecialchars($result, ENT_XML1).'</v>').'</c>';
            $xml = (string) preg_replace('#<c r="'.$coordinate.'"[^>]*/>|<c r="'.$coordinate.'"[^>]*>.*?</c>#s', $cell, $xml, 1, $count);
            if ($count === 0) {
                throw new \LogicException("Put a placeholder value in {$coordinate} first.");
            }
        }
        $zip->addFromString('xl/worksheets/sheet1.xml', $xml);
        $zip->close();

        return $upload;
    }

    protected function xlsxFromResponse(TestResponse $response): Spreadsheet
    {
        $path = tempnam(sys_get_temp_dir(), 'xlsx');
        file_put_contents($path, $response->streamedContent());

        return IOFactory::load($path);
    }
}
