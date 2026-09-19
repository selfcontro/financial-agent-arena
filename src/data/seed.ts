import source from './dataset.json' with { type: 'json' };
import { validateDataset } from '../services/validation.js';
/** Return independent state on every load; callers cannot mutate the seed. */
export function createSeedDataset() {
  return validateDataset(structuredClone(source));
}
