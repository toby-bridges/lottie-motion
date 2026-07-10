import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import process from 'process';
import { validateStructure } from './validate.js';
import { plan } from './planner/plan.js';
import { compile } from './compiler/compile.js';
import { builderGate, compilerGate, renderGate } from './gates/index.js';
import { eventSampleFrames, render } from './renderer/render.js';

const args = process.argv.slice(2);
const inputIdx = args.indexOf('--input');
const outputIdx = args.indexOf('--output');
const verifyIdx = args.indexOf('--verify');
const checkIdx = args.indexOf('--check');

if (inputIdx === -1 || outputIdx === -1) {
  console.error('Usage: cli.ts --input <structure.json> --output <animation.json> [--verify] [--check]');
  process.exit(1);
}

const inputPath = args[inputIdx + 1];
const outputPath = args[outputIdx + 1];
const shouldVerify = verifyIdx !== -1;
const shouldCheck = checkIdx !== -1;

async function main(): Promise<void> {
  try {
    // Read structure.json
    const structureRaw = JSON.parse(readFileSync(inputPath, 'utf-8'));

    // Validate
    const structure = validateStructure(structureRaw);

    // Plan
    const timeline = plan(structure);

    // Builder gate (cheapest) — run before compiling so a failing gate
    // short-circuits without spending a wasted compile pass.
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

    // Compile
    const lottie = compile(timeline);

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
      // Event-aligned sampling: one frame per reveal/flow completion plus the
      // global [0,n/4,n/2,3n/4,n-1] set. Passing the timeline + the exact frame
      // numbers rendered enables the gate's per-event region assertions.
      const frameNumbers = eventSampleFrames(timeline);
      const frames = await render(lottie, frameNumbers);
      const renderResult = renderGate(frames, { width: timeline.width, height: timeline.height }, timeline, frameNumbers);
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

    // Contract check (Option A: delegate to compilerGate)
    if (shouldCheck) {
      const checkResult = compilerGate(lottie, timeline);
      console.log(`Contract check: ${checkResult.pass ? 'PASS' : 'FAIL'}`);
      if (!checkResult.pass) {
        for (const msg of checkResult.failures) {
          console.error(`  ${msg}`);
        }
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('CLI error:', (e as Error).message);
    process.exit(1);
  }
}

main();
