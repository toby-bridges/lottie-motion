import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');
const tmpDir = path.join(__dirname, 'tmp');

describe('CLI: structure.json → animation.json', () => {
  beforeEach(() => {
    // Ensure tmpDir exists before writing structure.json
    if (!existsSync(tmpDir)) {
      mkdirSync(tmpDir, { recursive: true });
    }
  });

  afterEach(() => {
    const files = ['structure.json', 'animation.json'];
    for (const f of files) {
      const fp = path.join(tmpDir, f);
      if (existsSync(fp)) unlinkSync(fp);
    }
  });

  it('reads structure.json, validates, plans, compiles, writes animation.json on success', () => {
    // Copy fixture to tmpDir
    const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI
    const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath}`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    // Assert animation.json exists and contains Lottie shape
    expect(existsSync(animationPath)).toBe(true);
    const animation = JSON.parse(readFileSync(animationPath, 'utf-8'));
    expect(animation).toHaveProperty('v'); // Lottie schema
    expect(animation).toHaveProperty('fr'); // fps
    expect(animation).toHaveProperty('ip'); // in point
    expect(animation).toHaveProperty('op'); // out point
  });
});
