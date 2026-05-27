<?php

namespace App\Enums;

enum CategoryType: string
{
    case Asset = 'asset';
    case Contract = 'contract';
    case Stock = 'stock';
}
