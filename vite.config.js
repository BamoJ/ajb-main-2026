import { defineConfig } from 'vite';
import path from 'path';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

export default defineConfig({
	plugins: [cssInjectedByJsPlugin()],
	server: {
		host: 'localhost',
		port: 3000,
		hmr: {
			host: 'localhost',
			port: 3000,
			protocol: 'ws',
		},
		cors: true,
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@transitions': path.resolve(__dirname, './src/transitions'),
			'@components': path.resolve(__dirname, './src/components'),
			'@ui': path.resolve(__dirname, './src/components/ui'),
			'@utils': path.resolve(__dirname, './src/utils'),
			'@styles': path.resolve(__dirname, './src/styles'),
			'@animations': path.resolve(__dirname, './src/animations'),
			'@core': path.resolve(__dirname, './src/_core'),
			'@webflow': path.resolve(__dirname, './src/webflow'),
		},
	},
	build: {
		minify: 'terser',
		terserOptions: {
			compress: {
				drop_console: true,
				drop_debugger: true,
				pure_funcs: ['console.log'],
				pure_getters: true,
				dead_code: true,
				passes: 2,
				global_defs: {
					DEBUG: false,
					PRODUCTION: true,
				},
			},
			mangle: {
				toplevel: true,
			},
			format: {
				comments: false,
				beautify: false,
			},
			ecma: 2015,
			module: true,
		},
		rollupOptions: {
			input: './src/main.js',
			output: {
				dir: './dist',
				format: 'iife',
				entryFileNames: 'main.js',
				compact: true,
				esModule: false,
			},
		},
		cssMinify: true,
		cssCodeSplit: false,
		assetsInlineLimit: 4096,
		sourcemap: false,
		manifest: false,
	},
});
