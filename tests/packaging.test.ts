import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
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
