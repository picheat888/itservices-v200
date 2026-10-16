<?php

namespace App\Support\Perf;

/** Thai and English personal names for the perf dataset's employees. */
final class NamePool
{
    private const FIRST = [
        'Somchai', 'Somsak', 'Prasert', 'Wichai', 'Anan', 'Chaiwat', 'Nattapong', 'Kittisak', 'Surasak', 'Pornchai',
        'Thanakorn', 'Apinya', 'Supaporn', 'Kanokwan', 'Ratchanee', 'Siriporn', 'Nattaya', 'Pimchanok', 'Jirapa', 'Wannee',
        'Arthit', 'Boonmee', 'Chatchai', 'Decha', 'Ekkachai', 'Piyawat', 'Sarawut', 'Teerapong', 'Udom', 'Vichit',
        'Malee', 'Naree', 'Orawan', 'Patcharee', 'Rungnapa', 'Saowalak', 'Tipaporn', 'Usanee', 'Waraporn', 'Yupin',
        'James', 'Michael', 'David', 'Daniel', 'Emily', 'Sarah', 'Kenji', 'Takeshi', 'Yuki', 'Hiroshi',
    ];

    private const LAST = [
        'Srisawat', 'Chaiyaporn', 'Inthong', 'Sukjai', 'Wongsa', 'Jaidee', 'Thongchai', 'Boonyarit', 'Saetang', 'Rattanakorn',
        'Phromma', 'Kaewmanee', 'Sutthichai', 'Charoenphol', 'Pattanasin', 'Limsakul', 'Wattana', 'Prasertsuk', 'Yodsuwan', 'Kongsri',
        'Montri', 'Nakorn', 'Phetcharat', 'Rungruang', 'Sombat', 'Tanasak', 'Udomsap', 'Vongsa', 'Wiriya', 'Yimyam',
        'Smith', 'Johnson', 'Brown', 'Taylor', 'Tanaka', 'Suzuki', 'Sato', 'Watanabe', 'Anderson', 'Miller',
    ];

    private const FIRST_TH = [
        'สมชาย', 'สมศักดิ์', 'ประเสริฐ', 'วิชัย', 'อนันต์', 'ชัยวัฒน์', 'ณัฐพงษ์', 'กิตติศักดิ์', 'สุรศักดิ์', 'พรชัย',
        'ธนากร', 'อภิญญา', 'สุภาพร', 'กนกวรรณ', 'รัชนี', 'ศิริพร', 'ณัฐธิดา', 'พิมพ์ชนก', 'จิราภา', 'วันนี',
        'อาทิตย์', 'บุญมี', 'ชาตรี', 'เดชา', 'เอกชัย', 'ปิยะวัฒน์', 'ศราวุธ', 'ธีรพงษ์', 'อุดม', 'วิชิต',
        'มาลี', 'นารี', 'อรวรรณ', 'พัชรี', 'รุ่งนภา', 'เสาวลักษณ์', 'ทิพาภรณ์', 'อุษณีย์', 'วราภรณ์', 'ยุพิน',
    ];

    private const LAST_TH = [
        'ศรีสวัสดิ์', 'ชัยพร', 'อินทอง', 'สุขใจ', 'วงศ์สา', 'ใจดี', 'ทองชัย', 'บุญฤทธิ์', 'แซ่ตั้ง', 'รัตนากร',
        'พรหมมา', 'แก้วมณี', 'สุทธิชัย', 'เจริญผล', 'พัฒนศิลป์', 'ลิ้มสกุล', 'วัฒนา', 'ประเสริฐสุข', 'ยอดสุวรรณ', 'คงศรี',
        'มนตรี', 'นคร', 'เพชรรัตน์', 'รุ่งเรือง', 'สมบัติ', 'ธนศักดิ์', 'อุดมทรัพย์', 'วงษ์สวัสดิ์', 'วิริยะ', 'ยิ้มแย้ม',
    ];

    public static function first(Rng $rng): string
    {
        return $rng->pick(self::FIRST);
    }

    public static function last(Rng $rng): string
    {
        return $rng->pick(self::LAST);
    }

    public static function firstTh(Rng $rng): string
    {
        return $rng->pick(self::FIRST_TH);
    }

    public static function lastTh(Rng $rng): string
    {
        return $rng->pick(self::LAST_TH);
    }
}
