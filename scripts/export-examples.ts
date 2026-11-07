/**
 * Writes the built-in example designs to /examples as importable JSON files.
 * Run with: npm run examples
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXAMPLE_DESIGNS } from '../packages/engine/src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples');
mkdirSync(root, { recursive: true });
for (const e of EXAMPLE_DESIGNS) {
  const d = e.build();
  const file = join(root, `${e.id.replace(/^example-/, '')}.vanvolt.json`);
  writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
  console.log(`wrote ${file}`);
}
