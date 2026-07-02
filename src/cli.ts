import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import process from 'process';
import { validateStructure } from './validate.js';
import { plan } from './planner/plan.js';
import { compile } from './compiler/compile.js';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');

if (inputIdx === -1 || outputIdx === -1) {
  console.error('Usage: cli.ts --input <structure.json> --output <animation.json>');
  process.exit(1);
}

const inputPath = args[inputIdx + 1];
const outputPath = args[outputIdx + 1];

try {
  // Read structure.json
  const structureRaw = JSON.parse(readFileSync(inputPath, 'utf-8'));

  // Validate
  const structure = validateStructure(structureRaw);

  // Plan
  const timeline = plan(structure);

  // Compile
  const lottie = compile(timeline);

  // Write animation.json
  const outputDir = path.dirname(outputPath);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(lottie, null, 2));

  process.exit(0);
} catch (e) {
  console.error('CLI error:', (e as Error).message);
  process.exit(1);
}
