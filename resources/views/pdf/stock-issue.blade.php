{{-- Issue sheet (ISS) PDF of a fulfilled request (A4 portrait, Thai), rendered by StockIssuePdf. The footer is stamped by PdfFooter. --}}
@php
    $number = fn ($n) => number_format((int) $n);
@endphp
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $docNo }} ใบจ่ายของ - {{ \App\Support\CompanyProfile::issuer($company) }}</title>
    <style>
        @font-face { font-family: 'Sarabun'; font-weight: normal; src: url("{{ storage_path('fonts/Sarabun-Regular.ttf') }}") format('truetype'); }
        @font-face { font-family: 'Sarabun'; font-weight: bold; src: url("{{ storage_path('fonts/Sarabun-Bold.ttf') }}") format('truetype'); }
        * { font-family: 'Sarabun', sans-serif; }
        @page { margin: 37px 43px 61px; }
        body { margin: 0; color: #0f172a; font-size: 13px; }
        @include('pdf.partials.letterhead-style')
        table.lh { margin-bottom: 14px; }
        table.lh td { padding-bottom: 9px; }
        .lh-name { font-size: 17px; }
        .lh-line { font-size: 12.5px; }
        .lh-title { font-size: 20px; }
        .lh-title + .lh-line { font-size: 15px; font-weight: bold; color: #0f172a; }
        .muted { color: #475569; }
        table.facts { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 6px; }
        table.facts td { padding: 3px 0; vertical-align: top; }
        table.facts td.k { width: 96px; color: #475569; }
        h2 { font-size: 16px; margin: 18px 0 6px; page-break-after: avoid; }
        h2 .note { font-weight: normal; color: #475569; }
        table.data { width: 100%; border-collapse: collapse; font-size: 13px; }
        table.data thead { display: table-header-group; }
        table.data tr { page-break-inside: avoid; }
        table.data th { background: #f1f5f9; border: 0.7px solid #cbd5e1; padding: 6px 7px; text-align: left; font-size: 12.5px; }
        table.data td { border: 0.7px solid #cbd5e1; padding: 6px 7px; vertical-align: top; }
        table.data .r { text-align: right; }
        table.data .c { text-align: center; }
        table.data tr.total td { background: #f8fafc; }
        .box { display: inline-block; width: 14px; height: 14px; border: 1.2px solid #334155; vertical-align: middle; }
        .hint { font-size: 12px; margin-top: 6px; }
        .note-line { border-bottom: 1px dotted #94a3b8; height: 24px; }
        .end { page-break-inside: avoid; }
        table.sign { width: 100%; margin-top: 46px; border-collapse: collapse; font-size: 14px; }
        table.sign td { width: 33%; text-align: center; padding: 0 18px; vertical-align: top; }
        .sign-line { border-bottom: 1px dotted #111; height: 34px; margin-bottom: 6px; }
        .sign-date { font-size: 12.5px; }
    </style>
</head>
<body>
    @include('pdf.partials.letterhead', [
        'company' => $company,
        'title' => 'ใบจ่ายของ',
        'lines' => [$docNo, 'อ้างอิงคำขอเบิก '.$reference, 'พิมพ์เมื่อ '.$printedAt.' โดย '.$printer],
        'lang' => 'th',
    ])

    {{-- Facts --}}
    <table style="width: 100%; border-collapse: collapse;">
        <tr>
            <td style="width: 50%; vertical-align: top; padding-right: 20px;">
                <table class="facts">
                    <tr><td class="k">ผู้รับของ</td><td><b>{{ $receiver }}</b></td></tr>
                    <tr><td class="k">วันที่ขอ</td><td>{{ $requestedAt }}</td></tr>
                    <tr><td class="k">เหตุผล</td><td>{{ $reason ?: '—' }}</td></tr>
                </table>
            </td>
            <td style="vertical-align: top;">
                <table class="facts">
                    <tr><td class="k">จ่ายของเมื่อ</td><td><b>{{ $issuedAt }}</b></td></tr>
                    <tr><td class="k">จ่ายโดย</td><td>{{ $issuedBy ?: '—' }}</td></tr>
                    <tr><td class="k">อนุมัติโดย</td><td>{{ $approver ?: '—' }}{{ $approver && $approvedAt ? ' '.$approvedAt : '' }}</td></tr>
                </table>
            </td>
        </tr>
    </table>

    {{-- Items --}}
    <h2>รายการที่จ่าย</h2>
    <table class="data">
        <thead><tr><th style="width: 110px;">SKU</th><th>สินค้า</th><th class="r" style="width: 70px;">จำนวน</th><th style="width: 60px;">หน่วย</th></tr></thead>
        <tbody><tr><td>{{ $item['sku'] }}</td><td>{{ $item['name'] }}</td><td class="r"><b>{{ $number($item['qty']) }}</b></td><td>{{ $item['unit'] ?? '—' }}</td></tr></tbody>
    </table>

    {{-- Lots to pick --}}
    <h2>จ่ายจาก Lot <span class="note">(ติ๊กเมื่อหยิบแล้ว)</span></h2>
    <table class="data">
        <thead><tr><th class="c" style="width: 34px;">หยิบ</th><th style="width: 110px;">คลัง</th><th>Lot</th><th style="width: 92px;">รับเข้า</th><th class="r" style="width: 70px;">จำนวน</th></tr></thead>
        <tbody>
            @foreach ($lots as $lot)
                <tr>
                    <td class="c"><span class="box"></span></td>
                    <td>{{ $lot['warehouse'] }}</td>
                    <td><b>{{ $lot['lot_no'] }}</b>@if ($lot['emptied']) <span class="muted">หยิบหมด Lot</span>@endif</td>
                    <td>{{ $lot['received'] }}</td>
                    <td class="r"><b>{{ $number($lot['qty']) }}</b></td>
                </tr>
            @endforeach
            <tr class="total"><td colspan="4" class="r"><b>รวม</b></td><td class="r"><b>{{ $number($total) }}</b></td></tr>
        </tbody>
    </table>
    <div class="muted hint">Lot ตามที่ระบบตัดจริงตอนกดจ่ายของ</div>

    <div class="end">
        {{-- Notes --}}
        <h2>หมายเหตุ</h2>
        <div class="note-line" style="height: 28px;"></div>
        <div class="note-line"></div>

        {{-- Sign-off --}}
        <table class="sign">
            <tr>
                <td><div class="sign-line"></div>ผู้จ่ายของ{{ $issuedBy ? ' ('.$issuedBy.')' : '' }}<div class="muted sign-date">วันที่ ......../......../........</div></td>
                <td><div class="sign-line"></div>ผู้รับของ{{ $receiver ? ' ('.$receiver.')' : '' }}<div class="muted sign-date">วันที่ ......../......../........</div></td>
                <td><div class="sign-line"></div>ผู้อนุมัติ{{ $approver ? ' ('.$approver.')' : '' }}<div class="muted sign-date">@if ($approver && $approvedAt)อนุมัติในระบบแล้ว {{ $approvedAt }}@else วันที่ ......../......../........@endif</div></td>
            </tr>
        </table>
    </div>
</body>
</html>
