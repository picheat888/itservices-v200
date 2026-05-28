<?php

namespace App\Enums;

/** Hardware category of an asset. Labels/icons are resolved on the frontend. */
enum AssetType: string
{
    case Laptop = 'laptop';
    case Desktop = 'desktop';
    case Mobile = 'mobile';
    case Printer = 'printer';
    case Server = 'server';
    case Network = 'network';
    case Other = 'other';
}
