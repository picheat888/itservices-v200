{{-- Confirmed stock-count sheet PDF (A4 landscape), rendered by StockCountPdf. The footer is stamped by PdfFooter. --}}
@php
    $statusLabel = 'ยืนยันแล้ว';
    $number = fn ($n) => number_format($n);
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $count->reference }} ใบนับสต็อก - {{ \App\Support\CompanyProfile::issuer($company) }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 28px 32px 46px; }
        body { margin: 0; color: #0f172a; font-size: 10.5px; }
        @include('pdf.partials.letterhead-style')
        .muted { color: #475569; }
        table.facts { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 10.5px; }
        table.facts td { padding: 2px 0; vertical-align: top; }
        table.facts td.k { width: 70px; color: #475569; }
        table.tiles { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin: 0 0 4px -6px; }
        table.tiles td { border: 0.5px solid #cbd5e1; border-top: 3px solid #2563eb; padding: 5px 8px 6px; font-size: 10.5px; vertical-align: top; }
        table.tiles td.bad { border-top-color: #dc2626; }
        table.tiles td.good { border-top-color: #059669; }
        table.tiles td.same { border-top-color: #64748b; }
        table.tiles td.gap { width: 2px; border: 0; padding: 0; }
        .tile-label { font-size: 9.5px; color: #475569; }
        .tile-value { display: block; white-space: nowrap; font-size: 17px; font-weight: bold; line-height: 1.25; }
        .tile-unit { font-size: 10.5px; font-weight: normal; color: #475569; }
        h2 { font-size: 12px; margin: 12px 0 4px; page-break-after: avoid; }
        h2 .count { font-weight: normal; color: #475569; }
        table.data { width: 100%; border-collapse: collapse;  }
        table.data thead { display: table-header-group; }
        table.data tr { page-break-inside: avoid; }
        table.data th { background: #f1f5f9; border: 0.5px solid #cbd5e1; padding: 4px 5px; text-align: left; font-size: 9.5px; }
        table.data td { border: 0.5px solid #cbd5e1; padding: 3px 5px; font-size: 9.5px; vertical-align: top; }
        table.data .r { text-align: right; }
        table.data .c { text-align: center; }
        table.data .nw { white-space: nowrap; }
        tr.short td { background: #fef2f2; }
        tr.over td { background: #f0fdf4; }
        .short-t { color: #dc2626; }
        .over-t { color: #059669; }
        .sn { border: 1px solid #7c3aed; color: #6d28d9; padding: 0 3px; font-size: 8px; font-weight: bold; }
        .end { page-break-inside: avoid; }
        .totals { text-align: right; margin-top: 6px; font-size: 10.5px; color: #334155; }
        table.sign { width: 100%; margin-top: 34px; font-size: 10.5px; border-collapse: collapse; }
        table.sign td { width: 33%; text-align: center; padding: 0 16px; vertical-align: top; }
        .line { border-bottom: 1px dotted #111; height: 26px; margin-bottom: 4px; }
    </style>
</head>
<body>
    @include('pdf.partials.letterhead', [
        'company' => $company,
        'title' => 'ใบนับสต็อก',
        'lines' => [$count->reference, 'พิมพ์เมื่อ '.$printedAt.' โดย '.$printer],
        'lang' => 'th',
    ])

    <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
        <tr>
            <td style="width: 40%; vertical-align: top; padding-right: 16px;">
                <table class="facts">
                    <tr>
                        <td class="k">คลัง</td><td><b>{{ $count->warehouse }}</b></td>
                        <td class="k">สถานะ</td><td><b>{{ $statusLabel }}</b></td>
                    </tr>
                    <tr>
                        <td class="k">เปิดโดย</td><td>{{ $count->countedBy?->name ?? '—' }}</td>
                        <td class="k">เปิดเมื่อ</td><td>{{ $openedAt }}</td>
                    </tr>
                    <tr>
                        <td class="k">ยืนยันโดย</td><td>{{ $count->committedBy?->name ?? '—' }}</td>
                        <td class="k">ยืนยันเมื่อ</td><td>{{ $committedAt }}</td>
                    </tr>
                </table>
            </td>
            <td style="vertical-align: top;">
                <table class="tiles">
                    <tr>
                        <td style="width: 128px;"><span class="tile-label">นับแล้ว</span><span class="tile-value">{{ $number($totals['counted']) }} <span class="tile-unit">จาก {{ $number($totals['lines']) }} รายการ</span></span></td>
                        <td class="gap"></td>
                        <td class="same"><span class="tile-label">ยอดตรง</span><span class="tile-value">{{ $number($totals['same_lines']) }} <span class="tile-unit">รายการ</span></span></td>
                        <td class="bad"><span class="tile-label">ยอดขาด</span><span class="tile-value short-t">{{ $number($totals['short_lines']) }} <span class="tile-unit">รายการ@if ($totals['short_qty'] > 0) (−{{ $number($totals['short_qty']) }} Q'ty)@endif</span></span></td>
                        <td class="good"><span class="tile-label">ยอดเกิน</span><span class="tile-value over-t">{{ $number($totals['over_lines']) }} <span class="tile-unit">รายการ@if ($totals['over_qty'] > 0) (+{{ $number($totals['over_qty']) }} Q'ty)@endif</span></span></td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <h2>รายการนับ <span class="count">{{ $number($totals['lines']) }} รายการ</span></h2>
    <table class="data">
        <thead>
            <tr>
                <th class="r" style="width: 26px;">#</th><th style="width: 86px;">SKU</th><th>สินค้า</th><th class="r" style="width: 56px;">ในระบบ</th><th class="r" style="width: 56px;">นับได้</th><th class="c" style="width: 62px;">ส่วนต่าง</th><th style="width: 380px;">เหตุผล</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($rows as $row)
                @php
                    $counted = $row['counted_qty'] !== null;
                    $variance = $row['variance'];
                    $tint = $counted && $variance < 0 ? 'short' : ($counted && $variance > 0 ? 'over' : '');
                @endphp
                <tr class="{{ $tint }}">
                    <td class="r">{{ $row['no'] }}</td>
                    <td class="nw">{{ $row['sku'] }}</td>
                    <td>{{ $row['name'] }}@if ($row['track_serial']) <span class="sn">S/N</span>@endif</td>
                    <td class="r">{{ $number($row['system_qty']) }}</td>
                    @if ($counted)
                        <td class="r">@if ($variance !== 0)<b>{{ $number($row['counted_qty']) }}</b>@else{{ $number($row['counted_qty']) }}@endif</td>
                        <td class="c">
                            @if ($variance < 0)
                                <b class="short-t">−{{ $number(abs($variance)) }}</b>
                            @elseif ($variance > 0)
                                <b class="over-t">+{{ $number($variance) }}</b>
                            @else
                                <span class="muted">ตรง</span>
                            @endif
                        </td>
                        <td>
                            {{ $row['reason'] }}
                            @if ($row['missing_serials'] !== [])
                                <div class="muted">Serial ที่หาย {{ implode(', ', $row['missing_serials']) }}</div>
                            @endif
                        </td>
                    @else
                        <td class="r muted">—</td>
                        <td class="c muted">ไม่ได้นับ</td>
                        <td class="muted">ไม่ปรับยอด</td>
                    @endif
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="end">
        <div class="totals">รวม {{ $number($totals['lines']) }} รายการ นับแล้ว {{ $number($totals['counted']) }} ไม่ได้นับ {{ $number($totals['uncounted']) }} ปรับยอด {{ $number($totals['adjusted_lines']) }} รายการ ลด {{ $number($totals['short_qty']) }} เพิ่ม {{ $number($totals['over_qty']) }}</div>
        <table class="sign">
            <tr>
                <td><div class="line"></div>ลงชื่อผู้นับ<div class="muted">วันที่ ........ / ........ / ........</div></td>
                <td><div class="line"></div>ลงชื่อผู้ยืนยัน<div class="muted">{{ $count->committedBy?->name }} {{ $committedOn }}</div></td>
                <td><div class="line"></div>ลงชื่อผู้ตรวจสอบ<div class="muted">วันที่ ........ / ........ / ........</div></td>
            </tr>
        </table>
    </div>
</body>
</html>
