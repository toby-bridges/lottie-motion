import Ajv2020 from 'ajv/dist/2020.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { LottieJSON } from '../types/compiler.js';
import type { TimelineIR } from '../types/timeline.js';

export interface GateResult {
  pass: boolean;
  failures: string[];
}

let ajvInstance: Ajv2020 | null = null;
let compiledValidator: ((data: unknown) => boolean) | null = null;

function getValidator() {
  if (compiledValidator) {
    return compiledValidator;
  }

  if (!ajvInstance) {
    ajvInstance = new Ajv2020({ strict: false, allErrors: true });
  }

  // Read and parse schema once
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(__dirname, 'schema', 'lottie.schema.json');
  const schemaText = readFileSync(schemaPath, 'utf-8');
  const schema = JSON.parse(schemaText);

  // Compile the validator
  compiledValidator = ajvInstance.compile(schema);
  return compiledValidator;
}

export function compilerGate(lottie: LottieJSON, timeline: TimelineIR): GateResult {
  const failures: string[] = [];

  const validate = getValidator();
  const valid = validate(lottie);

  if (!valid && validate.errors) {
    for (const error of validate.errors) {
      failures.push(`Schema validation error: ${error.instancePath} ${error.message}`);
    }
  } else if (!valid) {
    failures.push('Schema validation failed (unknown error)');
  }

  // Contract validation: w/h/fr/op must match Timeline IR; ip must be 0
  if (lottie.w !== timeline.width) {
    failures.push(`Width contract mismatch: Lottie w=${lottie.w} does not match Timeline width=${timeline.width}`);
  }
  if (lottie.h !== timeline.height) {
    failures.push(`Height contract mismatch: Lottie h=${lottie.h} does not match Timeline height=${timeline.height}`);
  }
  if (lottie.fr !== timeline.fps) {
    failures.push(`Framerate contract mismatch: Lottie fr=${lottie.fr} does not match Timeline fps=${timeline.fps}`);
  }
  if (lottie.op !== timeline.totalFrames) {
    failures.push(`Out-point contract mismatch: Lottie op=${lottie.op} does not match Timeline totalFrames=${timeline.totalFrames}`);
  }
  if (lottie.ip !== 0) {
    failures.push(`In-point must be 0 (Lottie convention), got ip=${lottie.ip}`);
  }

  return {
    pass: failures.length === 0,
    failures
  };
}
