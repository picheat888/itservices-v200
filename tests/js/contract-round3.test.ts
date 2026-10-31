// Contract round 3 (CON-16): the contract controllers only gate, validate and answer; the work lives in the services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

test('the contract controllers hand summary, renewal, delete and files to the services', () => {
    const controller = read('app/Http/Controllers/Api/Contract/ContractController.php');
    assert.doesNotMatch(controller, /Storage|ContractExpiryAlertService|resetForContract|AppSetting|Contract::with\('vendor'\)->get\(\)/);
    assert.match(controller, /\$this->summaries->summary\(/);
    assert.match(controller, /\$this->service->delete\(\$contract\);/);

    const files = read('app/Http/Controllers/Api/Contract/ContractAttachmentController.php');
    assert.doesNotMatch(files, /Storage|Refusal|->attachments\(\)->create/);
    assert.match(files, /\$this->attachments->store\(\$contract, \$files\);/);
    assert.match(files, /\$this->attachments->delete\(\$contract, \$attachment\);/);

    const service = read('app/Services/Contract/ContractService.php');
    assert.equal(service.match(/\$this->alerts->resetForContract\(\$contract\);/g)?.length, 5, 'renew, cancel, reactivate, expire, delete');
});

test('a refused delete shows the reason the server sent', () => {
    assert.match(read('resources/js/modules/contract/hooks/use-contract-actions.tsx'), /confirmText: t\('contract_delete'\),\s*errorMessage: \(e\) => reasonWords\(e, t, 'contract_refusal_'\)/);
    for (const lang of ['th', 'en']) {
        const words = read(`resources/js/lang/${lang}/contract.ts`);
        for (const code of ['not_deletable', 'assets_linked']) assert.match(words, new RegExp(`contract_refusal_${code}: '`));
    }
});
