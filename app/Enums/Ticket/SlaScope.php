<?php

namespace App\Enums\Ticket;

/**
 * What a resolution target is keyed on.
 *
 * The three scopes answer different questions and that is why all three exist: a priority says
 * how URGENT a case is, judged by whoever picks it up; a request type says how LONG the work
 * takes, which is settled the moment somebody chooses what to ask for; a work class says how
 * LONG A REPAIR takes, judged by whoever has actually seen the job. "A new monitor" can be
 * urgent and still take three days to procure, and one number per case could never say all three.
 */
enum SlaScope: string
{
    case WorkClass = 'work_class';
    case Priority = 'priority';
    case RequestType = 'request_type';

    /**
     * scope ไหนชนะเมื่อเคสเข้าหลายข้อ
     *
     * work_class มาก่อนเพราะมันถูกเลือกโดยคนที่เห็นงานแล้ว ส่วน request_type ถูกเลือกโดย
     * คนกรอกฟอร์มก่อนมีใครไปดูของจริง — ข้อมูลที่ใหม่กว่าและแม่นกว่าควรชนะ และมันปลอดภัย
     * เพราะค่าเริ่มต้น `standard` ไม่ match กฎไหนเลย work_class จึงชนะได้เฉพาะตอนที่มีคน
     * ตั้งใจจัดประเภทจริง ๆ
     *
     * request_type มาก่อน priority ด้วยเหตุผลตรงข้าม: เคสจากคำขอ**ถูกตั้ง priority เสมอ**
     * ตอนกดรับ ถ้าให้ priority ชนะ กฎประเภทคำขอจะไม่มีวันทำงานเลยสักครั้ง
     *
     * @return list<self>
     */
    public static function precedence(): array
    {
        return [self::WorkClass, self::RequestType, self::Priority];
    }
}
