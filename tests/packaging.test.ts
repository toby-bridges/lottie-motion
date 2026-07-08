import { describe, it, expect, beforeAll } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

describe('packaging', () => {
  describe('build artifacts', () => {
    beforeAll(() => {
      // Ensure dist is built with schema copied
      execSync('npm run build', { timeout: 60000 });
    });

    it('copies schema JSON to dist/gates/schema/ during build', () => {
      const schemaPath = 'dist/gates/schema/lottie.schema.json';
      expect(existsSync(schemaPath)).toBe(true);
    });

    it('copies the vendored label font (and its license) to dist during build', () => {
      expect(existsSync('dist/compiler/fonts/FiraSans-Regular.ttf')).toBe(true);
      expect(existsSync('dist/compiler/fonts/LICENSE-FiraSans.txt')).toBe(true);
    });

    it('built compilerGate loads schema and validates without ENOENT', async () => {
      // Dynamically import the BUILT compilerGate from dist
      const { compilerGate } = await import('../dist/gates/compilerGate.js');

      const validLottie = {
        v: '5.9.0',
        fr: 30,
        ip: 0,
        op: 60,
        w: 100,
        h: 100,
        layers: []
      };

      const validTimeline = {
        fps: 30,
        width: 100,
        height: 100,
        totalFrames: 60,
        events: []
      };

      // This should NOT throw ENOENT; it should return a GateResult
      const result = compilerGate(validLottie, validTimeline);
      expect(result).toBeDefined();
      expect(result.pass).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('importing the library root is side-effect free (no global DOM, no jsdom/canvas/lottie-web loaded)', () => {
      // Run in a FRESH Node process so the assertion is not polluted by other
      // tests that legitimately create a JSDOM. `node -e` runs as CommonJS, so
      // require.cache is available to detect whether the heavy/native deps were
      // pulled in at import time. jsdom, canvas and lottie-web are all CJS, so a
      // load would show up in require.cache. execFileSync avoids shell quoting.
      const script = [
        "const names = ['jsdom', 'canvas', 'lottie-web'];",
        "import('./dist/index.js').then((m) => {",
        "  const leaked = Object.keys(require.cache).filter((p) =>",
        "    names.some((n) => p.includes('/node_modules/' + n + '/')));",
        '  const out = {',
        '    window: typeof globalThis.window,',
        '    document: typeof globalThis.document,',
        '    leaked,',
        '    plan: typeof m.plan,',
        '    compile: typeof m.compile,',
        '    validateStructure: typeof m.validateStructure,',
        '    parseMxGraph: typeof m.parseMxGraph,',
        '    builderGate: typeof m.builderGate,',
        '    compilerGate: typeof m.compilerGate,',
        '    render: typeof m.render,',
        '    sampleFrames: typeof m.sampleFrames,',
        '  };',
        "  process.stdout.write('RESULT:' + JSON.stringify(out));",
        "}).catch((e) => { process.stdout.write('THROWN:' + (e && e.message)); process.exit(7); });",
      ].join('\n');

      const raw = execFileSync('node', ['-e', script], { encoding: 'utf-8' });
      const marker = raw.indexOf('RESULT:');
      expect(marker, `child did not report RESULT; got: ${raw}`).toBeGreaterThanOrEqual(0);
      const res = JSON.parse(raw.slice(marker + 'RESULT:'.length));

      // Criterion A: no global DOM stomping on import.
      expect(res.window).toBe('undefined');
      expect(res.document).toBe('undefined');
      // Criterion A: none of the heavy/native/optional deps loaded at import.
      expect(res.leaked).toEqual([]);
      // Criterion B: pure functionality is reachable without render deps.
      expect(res.plan).toBe('function');
      expect(res.compile).toBe('function');
      expect(res.validateStructure).toBe('function');
      expect(res.parseMxGraph).toBe('function');
      expect(res.builderGate).toBe('function');
      expect(res.compilerGate).toBe('function');
      // render/sampleFrames stay exported — the re-export is side-effect free.
      expect(res.render).toBe('function');
      expect(res.sampleFrames).toBe('function');
    });
  });

  describe('npm pack', () => {
    it('includes dist files and schema in package tarball', () => {
      // Run npm pack --dry-run in JSON format to get file list
      const packOutput = execSync('npm pack --dry-run --json', {
        encoding: 'utf-8',
        timeout: 60000
      });

      const packData = JSON.parse(packOutput);
      expect(Array.isArray(packData)).toBe(true);
      expect(packData.length).toBeGreaterThan(0);

      const files = packData[0].files;
      expect(files).toBeDefined();

      // Convert file list to Set for easier lookup
      const fileNames = new Set(files.map((f: any) => f.path));

      // Verify critical dist files are included
      expect(fileNames.has('dist/index.js')).toBe(true);
      expect(fileNames.has('dist/gates/compilerGate.js')).toBe(true);
      expect(fileNames.has('dist/gates/schema/lottie.schema.json')).toBe(true);
      expect(fileNames.has('dist/compiler/fonts/FiraSans-Regular.ttf')).toBe(true);
      expect(fileNames.has('dist/compiler/fonts/LICENSE-FiraSans.txt')).toBe(true);

      // Verify that SOURCE files are NOT in the package
      // (since files field limits to dist only)
      const sourcePaths = Array.from(fileNames).filter(
        (f: string) => f.startsWith('src/') && f.endsWith('.ts')
      );
      expect(sourcePaths).toHaveLength(0);
    });
  });

  describe('gitignore', () => {
    it('does not commit dist/ to git but marks it for npm publish', async () => {
      // Check that dist/ is in .gitignore
      const fs = await import('node:fs');
      const gitignore = fs.readFileSync('.gitignore', 'utf-8');
      expect(gitignore).toContain('dist/');

      // Check that package.json has files field to override .gitignore for npm
      const packageJson = fs.readFileSync('package.json', 'utf-8');
      const pkg = JSON.parse(packageJson);
      expect(pkg.files).toBeDefined();
      expect(pkg.files).toContain('dist');
    });

    it('prevents .tgz tarball artifacts from being committed', async () => {
      // Check that *.tgz is in .gitignore
      const fs = await import('node:fs');
      const gitignore = fs.readFileSync('.gitignore', 'utf-8');
      expect(gitignore).toContain('*.tgz');
    });
  });
});
