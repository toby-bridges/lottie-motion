import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import process from 'process';
import { validateStructure } from './validate.js';
import { plan } from './planner/plan.js';
import { compile } from './compiler/compile.js';
import { builderGate, compilerGate, renderGate } from './gates/index.js';
import { sampleFrames, render } from './renderer/render.js';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');
const verifyIdx = args.indexOf('--verify');

if (inputIdx === -1 || outputIdx === -1) {
  console.error('Usage: cli.ts --input <structure.json> --output <animation.json> [--verify]');
  process.exit(1);
}

const inputPath = args[inputIdx + 1];
const outputPath = args[outputIdx + 1];
const shouldVerify = verifyIdx !== -1;

async function main(): Promise<void> {
  try {
    // Read structure.json
    const structureRaw = JSON.parse(readFileSync(inputPath, 'utf-8'));

    // Validate
    const structure = validateStructure(structureRaw);

    // Plan
    const timeline = plan(structure);

    // Compile
    const lottie = compile(timeline);

    // Builder gate (cheapest)
    if (shouldVerify) {
      const builderResult = builderGate(timeline, structure);
      console.log(`Builder gate: ${builderResult.pass ? 'PASS' : 'FAIL'}`);
      if (!builderResult.pass) {
        for (const msg of builderResult.failures) {
          console.error(`  ${msg}`);
        }
        process.exit(1);
      }
    }

    // Compiler gate
    if (shouldVerify) {
      const compilerResult = compilerGate(lottie, timeline);
      console.log(`Compiler gate: ${compilerResult.pass ? 'PASS' : 'FAIL'}`);
      if (!compilerResult.pass) {
        for (const msg of compilerResult.failures) {
          console.error(`  ${msg}`);
        }
        process.exit(1);
      }
    }

    // Render gate (most expensive)
    if (shouldVerify) {
      const frames = await render(lottie, sampleFrames(timeline.totalFrames));
      const renderResult = renderGate(frames, { width: timeline.width, height: timeline.height });
      console.log(`Render gate: ${renderResult.pass ? 'PASS' : 'FAIL'}`);
      if (!renderResult.pass) {
        for (const msg of renderResult.failures) {
          console.error(`  ${msg}`);
        }
        process.exit(1);
      }
    }

    // Write animation.json
    const outputDir = path.dirname(outputPath);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(outputPath, JSON.stringify(lottie, null, 2));

    process.exit(0);
  } catch (e) {
    console.error('CLI error:', (e as Error).message);
    process.exit(1);
  }
}

main();
