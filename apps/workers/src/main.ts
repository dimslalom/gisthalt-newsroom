import { startWorkers } from '../../../packages/pipeline/src/scheduler.ts';
import { closeDatabase } from '@newsroom/db';
try { await startWorkers(); } finally { await closeDatabase(); }
