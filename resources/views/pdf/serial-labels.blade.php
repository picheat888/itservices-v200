@php
    // 3 stickers per row across an A4 page (210mm − 16mm margins ≈ 194mm / ~64mm cells).
    $rows = array_chunk($labels, 3);
    // dompdf has no `text-overflow: ellipsis`, so truncate the name in PHP. The char cap
    // keeps "Name: …" on one line inside the 50 mm sticker; overflow:hidden is the backstop.
    $name = \Illuminate\Support\Str::limit($item->name ?? '', 30);
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Serial labels · {{ $item->sku ?? '' }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 8mm; }
        body { margin: 0; color: #000; }
        table.sheet { border-collapse: collapse; table-layout: fixed; width: 100%; }
        table.sheet td.cell { width: 33.33%; padding: 0 3mm 4mm 0; vertical-align: top; }
        .label { width: 50mm; height: 25mm; border: 0.4mm solid #bbb; border-radius: 1.5mm; padding: 1.5mm; }
        .line { width: 100%; border-collapse: collapse; }
        .line td { padding: 0; font-size: 7pt; vertical-align: top; }
        .lbl { color: #555; font-weight: normal; }
        .cat { text-align: right; color: #555; }
        .name { font-size: 7pt; white-space: nowrap; overflow: hidden; }
        .bc { margin-top: 1mm; }
        .serial { text-align: center; font-weight: bold; font-size: 6pt; letter-spacing: 0.3pt; margin-top: 0.5mm; }
        .foot td { font-size: 6.5pt; color: #555; }
        .empty { width: 33.33%; }
    </style>
</head>
<body>
    @if (count($labels) === 0)
        <p style="font-size:10pt;color:#555;">No serials attached to this movement.</p>
    @else
        <table class="sheet">
            @foreach ($rows as $row)
                <tr>
                    @foreach ($row as $label)
                        <td class="cell">
                            <div class="label">
                                <table class="line">
                                    <tr>
                                        <td class="sku"><span class="lbl">SKU:</span> {{ $item->sku ?? '' }}</td>
                                        <td class="cat">{{ $item->category ?? '' }}</td>
                                    </tr>
                                </table>
                                <div class="name"><span class="lbl">Name:</span> {{ $name }}</div>
                                <div class="bc">{!! $label['barcode'] !!}</div>
                                <div class="serial">{{ $label['serial'] }}</div>
                                <table class="line foot">
                                    <tr>
                                        <td><span class="lbl">Date:</span> {{ $date }}</td>
                                        <td class="cat">{{ $warehouse }}</td>
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
    @endif
</body>
</html>
