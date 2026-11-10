{{-- A4 sheet of one lot's 50 × 25 mm QR stickers, 3 per row like the serial stickers (StockLotController::labelsPdf). --}}
@php
    $rows = array_chunk(array_fill(0, $copies, true), 3);
    // dompdf has no text-overflow: ellipsis, so the name is cut in PHP.
    $name = \Illuminate\Support\Str::limit($item?->name ?? '', 22);
    $unit = $item?->unit?->name;
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Lot labels - {{ $lot->lot_no }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/SarabunPdf-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/SarabunPdf-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 8mm; }
        body { margin: 0; color: #000; }
        table.sheet { border-collapse: collapse; table-layout: fixed; width: 100%; }
        table.sheet td.cell { width: 33.33%; padding: 0 3mm 4mm 0; vertical-align: top; }
        .label { width: 50mm; height: 25mm; border: 0.4mm solid #bbb; border-radius: 1.5mm; padding: 1.5mm; }
        table.body { width: 100%; border-collapse: collapse; }
        table.body td { padding: 0; vertical-align: middle; }
        td.qr { width: 23mm; height: 25mm; }
        td.qr img { width: 23mm; height: 23mm; display: block; }
        td.text { padding-left: 2mm; }
        .lot { font-size: 7pt; font-weight: bold; white-space: nowrap; }
        .sku, .name { font-size: 6.5pt; white-space: nowrap; overflow: hidden; }
        .qty, .received { font-size: 6pt; color: #444; white-space: nowrap; }
        .empty { width: 33.33%; }
    </style>
</head>
<body>
    <table class="sheet">
        @foreach ($rows as $row)
            <tr>
                @foreach ($row as $copy)
                    <td class="cell">
                        <div class="label">
                            <table class="body">
                                <tr>
                                    <td class="qr"><img src="{{ $qr }}" alt=""></td>
                                    <td class="text">
                                        <div class="lot">{{ $lot->lot_no }}</div>
                                        <div class="sku">{{ $item?->sku }}</div>
                                        <div class="name">{{ $name }}</div>
                                        <div class="qty"><b>Qty {{ number_format((int) $lot->qty_received) }}{{ $unit ? ' '.$unit : '' }}</b></div>
                                        <div class="received">Received {{ $received }}</div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    </td>
                @endforeach
                @for ($i = count($row); $i < 3; $i++)
                    <td class="empty"></td>
                @endfor
            </tr>
        @endforeach
    </table>
</body>
</html>
