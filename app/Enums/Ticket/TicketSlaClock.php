<?php

namespace App\Enums\Ticket;

/**
 * นาฬิกาที่แถวกฎ SLA หนึ่งแถวนับด้วย
 *
 * Business คือพฤติกรรมเดิมของทั้งระบบ — นับเฉพาะเวลาทำการตาม TicketSla::hours()
 * Calendar นับเวลาจริง 24/7 ซึ่งจำเป็นเพราะ KPI อย่าง "ซ่อมให้เสร็จใน 30 วัน" ที่องค์กร
 * ประกาศไว้ ไม่ได้หมายถึง 30 วันทำการเสมอไป และการเดาแทนผู้ดูแลระบบคือการตอบคำถามที่
 * ไม่ใช่คำถามของโค้ด
 */
enum TicketSlaClock: string
{
    case Business = 'business';
    case Calendar = 'calendar';
}
