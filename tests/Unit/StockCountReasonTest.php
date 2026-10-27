<?php

namespace Tests\Unit;

use App\Enums\Stock\StockCountReason;
use PHPUnit\Framework\TestCase;

class StockCountReasonTest extends TestCase
{
    public function test_sides(): void
    {
        foreach ([StockCountReason::Lost, StockCountReason::Broken, StockCountReason::Used] as $reason) {
            $this->assertTrue($reason->fitsVariance(-1));
            $this->assertFalse($reason->fitsVariance(1));
        }
        foreach ([StockCountReason::Inbound, StockCountReason::Returned] as $reason) {
            $this->assertTrue($reason->fitsVariance(1));
            $this->assertFalse($reason->fitsVariance(-1));
        }
        foreach ([StockCountReason::Miscount, StockCountReason::Custom] as $reason) {
            $this->assertTrue($reason->fitsVariance(1));
            $this->assertTrue($reason->fitsVariance(-1));
        }
        foreach (StockCountReason::cases() as $reason) {
            $this->assertFalse($reason->fitsVariance(0));
        }
    }

    public function test_labels(): void
    {
        $this->assertSame('เบิกไปแล้วไม่ได้บันทึก', StockCountReason::Used->label('th'));
        $this->assertSame('รับเข้าแล้วไม่ได้บันทึก', StockCountReason::Inbound->label('th'));
        $this->assertSame('ใบนับก่อนหน้านับผิด', StockCountReason::Miscount->label('th'));
        $this->assertSame('ระบุเอง', StockCountReason::Custom->label('th'));
        foreach (StockCountReason::cases() as $reason) {
            $this->assertNotSame('', $reason->label('en'));
            $this->assertNotSame('', $reason->label('th'));
        }
    }
}
