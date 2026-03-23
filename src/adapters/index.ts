/**
 * Adapter module exports
 */

export * from './adapter-factory';
export * from './csv-import/csv-adapter';

// Register default adapters
import { registerAdapter } from './adapter-factory';
import { CSVAdapter } from './csv-import/csv-adapter';

// Auto-register CSV adapter
registerAdapter('csv-import', CSVAdapter);
registerAdapter('manual', CSVAdapter); // Alias

// NYC adapter will be registered when implemented
// registerAdapter('nyc-parks-api', NYCParksAdapter);
