/**
 * Adapter module exports
 */

export * from './adapter-factory';
export * from './csv-import/csv-adapter';
export * from './nyc/nyc-mock-adapter';

// Register default adapters
import { registerAdapter } from './adapter-factory';
import { CSVAdapter } from './csv-import/csv-adapter';
import { NYCMockAdapter } from './nyc/nyc-mock-adapter';

// Auto-register CSV adapter
registerAdapter('csv-import', CSVAdapter);
registerAdapter('manual', CSVAdapter); // Alias

// Register NYC mock adapter
registerAdapter('nyc-mock', NYCMockAdapter);
