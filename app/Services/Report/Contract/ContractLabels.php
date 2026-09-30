<?php

namespace App\Services\Report\Contract;

/**
 * Contract type / billing-cycle labels shared by the contract tabular reports
 * (ContractExpiringReport, ContractMonthlyCostReport): the i18n key the page shows and the
 * Thai label the Excel/PDF prints, so the two reports never word a contract differently.
 * Thai labels mirror resources/js/lang/th/contract.ts.
 */
trait ContractLabels
{
    private const TYPE_KEYS = [
        'software' => 'contract_type_software', 'hardware' => 'contract_type_hardware',
        'service' => 'contract_type_service', 'connectivity' => 'contract_type_connectivity',
        'other' => 'contract_type_other',
    ];

    private const TYPE_TH = [
        'software' => 'ซอฟต์แวร์', 'hardware' => 'ฮาร์ดแวร์', 'service' => 'บริการ',
        'connectivity' => 'เครือข่าย', 'other' => 'อื่น ๆ',
    ];

    private const CYCLE_KEYS = ['monthly' => 'contract_billing_monthly', 'quarterly' => 'contract_billing_quarterly', 'yearly' => 'contract_billing_yearly'];

    private const CYCLE_TH = ['monthly' => 'รายเดือน', 'quarterly' => 'รายไตรมาส', 'yearly' => 'รายปี'];
}
