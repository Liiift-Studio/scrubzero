// tsup build configuration — dual ESM + CJS output with CLI entry point.
import { defineConfig } from 'tsup';

export default defineConfig([
	{
		entry: { index: 'src/index.ts' },
		format: ['esm', 'cjs'],
		dts: true,
		splitting: false,
		sourcemap: true,
		clean: true,
		target: 'node18',
		outDir: 'dist',
		treeshake: true,
		external: ['pdfjs-dist', 'pdf-lib', 'commander'],
	},
	{
		entry: { cli: 'src/cli.ts' },
		format: ['esm'],
		dts: false,
		splitting: false,
		sourcemap: true,
		clean: false,
		target: 'node18',
		outDir: 'dist',
		banner: {
			js: '#!/usr/bin/env node',
		},
		external: ['pdfjs-dist', 'pdf-lib', 'commander'],
	},
]);
