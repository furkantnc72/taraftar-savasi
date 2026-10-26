import { checkOnline } from 'piratetok-live-js';

const username='tncfurkan72';
try {
  const result=await checkOnline(username);
  console.log('CHECK_OK', JSON.stringify(result));
  process.exit(0);
} catch (e) {
  console.error('CHECK_FAIL_NAME', e?.name || 'Error');
  console.error('CHECK_FAIL_MESSAGE', e?.message || String(e));
  console.error('CHECK_FAIL_KIND', e?.kind || e?.errorKind || e?.code || '');
  process.exit(2);
}
