import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(__dirname, 'fixtures');
const tmpDir = path.join(__dirname, 'tmp');

// Use import.meta.dirname for Node 20+
const rootDir = path.join(import.meta.dirname || __dirname, '..');

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

  it('--verify runs builder, compiler, render gates and exits 0 on success (multi-node fixture with edges)', () => {
    // Copy real multi-node fixture (with flow edges) to tmpDir
    const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI with --verify
    const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --verify`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    expect(result).toContain('Builder gate: PASS');
    expect(result).toContain('Compiler gate: PASS');
    expect(result).toContain('Render gate: PASS');
  });

  it('--check validates output contract (w, h, fr, op-ip)', () => {
    const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI with --check
    const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --check`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    expect(result).toContain('Contract check: PASS');
  });

  it('e2e: --verify --check runs all gates and checks contract, exits 0 on complete success', () => {
    const fixtureInput = path.join(fixtureDir, 'simple-chain.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI with both --verify and --check
    const cmd = `npx tsx src/cli.ts --input ${structurePath} --output ${animationPath} --verify --check`;
    const result = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });

    expect(result).toContain('Builder gate: PASS');
    expect(result).toContain('Compiler gate: PASS');
    expect(result).toContain('Render gate: PASS');
    expect(result).toContain('Contract check: PASS');

    // Verify animation.json was written
    expect(existsSync(animationPath)).toBe(true);
    const animation = JSON.parse(readFileSync(animationPath, 'utf-8'));
    expect(animation.v).toBeDefined(); // Lottie version
  });

  it('exits nonzero (lanshu discipline) when structure is invalid (dangling edge)', () => {
    const fixtureInput = path.join(fixtureDir, 'broken-structure.json');
    const structurePath = path.join(tmpDir, 'structure.json');
    const animationPath = path.join(tmpDir, 'animation.json');

    const fixtureContent = readFileSync(fixtureInput, 'utf-8');
    writeFileSync(structurePath, fixtureContent);

    // Run CLI — should fail
    let exitCode = 0;
    try {
      execSync(`npx tsx src/cli.ts --input ${structurePath} --output ${animationPath}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
    } catch (e: any) {
      exitCode = e.status;
    }

    expect(exitCode).not.toBe(0);
  });

  it('skill manifest correctly declares input/output/flags', () => {
    const manifestPath = path.join(rootDir, 'skill-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    expect(manifest.name).toBe('lottie-motion');
    expect(manifest.requires.input_file.format).toBe('json');
    expect(manifest.produces.output_file.format).toBe('json');
    expect(manifest.flags.map((f: any) => f.name)).toContain('input');
    expect(manifest.flags.map((f: any) => f.name)).toContain('output');
    expect(manifest.flags.map((f: any) => f.name)).toContain('verify');
    expect(manifest.flags.map((f: any) => f.name)).toContain('check');
  });
});
