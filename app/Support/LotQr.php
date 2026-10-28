<?php

// QR code of a lot's page link as a plain SVG string (served as an image and embedded in the sticker PDF).

namespace App\Support;

use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Output\QRMarkupSVG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;

class LotQr
{
    public static function svg(string $lotNo): string
    {
        $options = new QROptions([
            'outputInterface' => QRMarkupSVG::class,
            'eccLevel' => EccLevel::M,
            'outputBase64' => false,
        ]);

        return (string) (new QRCode($options))->render(self::payload($lotNo));
    }

    public static function payload(string $lotNo): string
    {
        return rtrim((string) config('app.url'), '/').'/stock/lots/'.$lotNo;
    }
}
