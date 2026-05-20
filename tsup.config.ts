// tsup build configuration for dual ESM + CJS output
import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	sourcemap: true,
	clean: true,
	splitting: false,
	external: ['pdfjs-dist', 'pdf-lib'],
	target: 'node18',
	outExtension({ format }) {
		return {
			js: format === 'cjs' ? '.cjs' : '.js',
		};
	},
});
