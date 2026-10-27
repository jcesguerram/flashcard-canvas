// Runs the unit tests: bundles each tests/*.test.ts with esbuild and runs it with Node.
import esbuild from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'flashcard-canvas-tests-'));
let status = 0;
for (const name of ['callout', 'layout']) {
	const out = join(dir, `${name}.cjs`);
	await esbuild.build({ entryPoints: [`tests/${name}.test.ts`], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'warning' });
	console.log(`── ${name}.test.ts`);
	const res = spawnSync(process.execPath, [out], { stdio: 'inherit' });
	if (res.status !== 0) status = 1;
}
process.exit(status);
