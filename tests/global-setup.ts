import { resetAllData } from './helpers/api';

async function globalSetup(): Promise<void> {
  console.log('[Global Setup] Resetting all data...');
  await resetAllData();
  console.log('[Global Setup] Data reset complete.');
}

export default globalSetup;
