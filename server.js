import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response';
import { build as esbuild } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { serveStatic } from '@hono/node-server/serve-static';
import { renderToPipeableStream } from 'react-server-dom-esm/server';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { parse } from 'es-module-lexer';
import { relative, resolve } from 'node:path';
import { getServerFunction } from './server/server-functions.js';

const app = new Hono();

/**
 * Endpoint to serve your index route.
 * Includes the loader `/build/_client.js` to request your server component
 * and stream results into `<div id="root">`
 */
app.get('/', async (c) => {
	return c.html(`
	<!DOCTYPE html>
	<html>
	<head>
		<title>React Server Components from Scratch</title>
		<script src="https://cdn.tailwindcss.com"></script>
	</head>
	<body>
		<div id="root"></div>
		<script type="module" src="/build/_client.js"></script>
	</body>
	</html>
	`);
});

/**
 * Endpoint to render your server component to a stream.
 * This uses `react-server-dom-webpack` to parse React elements
 * into encoded virtual DOM elements for the client to read.
 */
app.get('/rsc', async (c) => {
	// Note This will raise a type error until you build with `npm run dev`
	const Page = await import('./build/page.js');
	const Comp = createElement(Page.default);

	const stream = renderToPipeableStream(Comp, '');
	// @ts-expect-error type of env is 'unknown'
	stream.pipe(c.env.outgoing);

	return RESPONSE_ALREADY_SENT;
});

/**
 * Server Functions endpoint - executes server functions and streams back fresh RSC payload
 */
app.post('/server-fn', async (c) => {
	try {
		const { id, args = [] } = await c.req.json();

		// Execute the server function
		const fn = getServerFunction(id);
		await fn(...args);

		// Stream back updated component tree (same as existing actions)
		const Page = await import('./build/page.js');
		const Comp = createElement(Page.default);
		const stream = renderToPipeableStream(Comp, '');
		// @ts-expect-error type of env is 'unknown'
		stream.pipe(c.env.outgoing);

		return RESPONSE_ALREADY_SENT;
	} catch (err) {
		console.error('Server function error:', err);
		return c.json({ error: err instanceof Error ? err.message : 'Server error' }, 500);
	}
});

/**
 * Serve your `build/` folder as static assets.
 * Allows you to serve built client components
 * to import from your browser.
 */
app.use('/build/*', serveStatic());

/**
 * Build both server and client components with esbuild
 */
async function build() {
	const clientEntryPoints = new Set();
	const serverFunctionEntryPoints = new Set();

	// Find all server function modules
	const actionsDir = resolveApp('actions');
	try {
		const actionFiles = await readdir(actionsDir);
		for (const file of actionFiles) {
			if (file.endsWith('.js') || file.endsWith('.jsx')) {
				const filePath = resolve(actionsDir, file);
				const contents = await readFile(filePath, 'utf8');
				if (contents.startsWith("'use server'") || contents.startsWith('"use server"')) {
					serverFunctionEntryPoints.add(filePath);
				}
			}
		}
	} catch (err) {
		// No actions directory, that's fine
	}

	/** Build the server component tree */
	await esbuild({
		bundle: true,
		format: 'esm',
		logLevel: 'error',
		entryPoints: [resolveApp('page.jsx'), ...serverFunctionEntryPoints],
		outdir: resolveBuild(),
		// avoid bundling npm packages for server-side components
		packages: 'external',
		// keep state module external so server action and page share same instance
		// keep server-functions module external so main server and server functions share same registry
		external: ['../server/state.js', '../../server/state.js', '../../server/server-functions.js'],
		plugins: [
			{
				name: 'resolve-client-imports',
				setup(build) {
					// Intercept component imports to check for 'use client'
					build.onResolve(
						{ filter: reactComponentRegex },
						async ({ path: relativePath, resolveDir }) => {
							const path = resolve(resolveDir, relativePath);

							const contents = await readFile(path, 'utf-8');

							if (contents.startsWith("'use client'")) {
								clientEntryPoints.add(path);
								return {
									// Avoid bundling client components into the server build.
									external: true,
									// Resolve the client import to the built `.js` file
									// created by the client `esbuild` process below.
									path: relativePath.replace(reactComponentRegex, '.js')
								};
							}
						}
					);
				}
			},
			{
				name: 'register-server-functions',
				setup(build) {
					// Auto-register exports from 'use server' modules
					build.onLoad({ filter: /\.jsx?$/ }, async ({ path }) => {
						const source = await readFile(path, 'utf8');
						if (!source.startsWith("'use server'") && !source.startsWith('"use server"')) {
							return; // Not a server function module
						}

						// Parse exports from the server function module
						const [, exports] = parse(source);

						// Generate registration code for each export
						const registrations = exports
							.filter((e) => e.n && e.n !== 'default') // Skip default exports for now
							.map((e) => {
								// Create id: relative path from app dir + export name (same as client)
								const relativePath = relative(resolveApp(), path).replace(/\\/g, '/');
								const id = `${relativePath}#${e.n}`;
								return `import { registerServerFunction } from '../../server/server-functions.js';
registerServerFunction(${JSON.stringify(id)}, ${e.n});`;
							})
							.join('\n');

						// Return original source + auto-registration
						return {
							contents: source + '\n' + registrations,
							loader: 'js'
						};
					});
				}
			}
		]
	});

	/** Build client components */
	const { outputFiles } = await esbuild({
		bundle: true,
		format: 'esm',
		logLevel: 'error',
		entryPoints: [resolveApp('_client.jsx'), ...clientEntryPoints],
		outdir: resolveBuild(),
		splitting: true,
		write: false,
		plugins: [
			{
				name: 'server-functions-proxy-client',
				setup(build) {
					// Intercept imports of 'use server' modules from client code
					build.onResolve({ filter: /.*/ }, async ({ path: relativePath, resolveDir }) => {
						// Only handle .js/.jsx imports
						if (!relativePath.match(/\.jsx?$/)) return;

						const absolutePath = resolve(resolveDir, relativePath);

						try {
							const source = await readFile(absolutePath, 'utf8');
							if (source.startsWith("'use server'") || source.startsWith('"use server"')) {
								// This is a server function module being imported by client code
								return { path: absolutePath, namespace: 'server-fn-proxy' };
							}
						} catch (err) {
							// File doesn't exist or can't be read, let esbuild handle it
						}
						return; // Let esbuild handle normal imports
					});

					// Generate proxy stubs for server function modules
					build.onLoad({ filter: /.*/, namespace: 'server-fn-proxy' }, async ({ path }) => {
						const source = await readFile(path, 'utf8');
						const [, exports] = parse(source);

						// Generate proxy functions for each export
						const proxies = exports
							.filter((e) => e.n && e.n !== 'default') // Skip default exports for now
							.map((e) => {
								// Create the same id format as server registration
								// Use path relative to app dir, not build dir for consistency
								const relativePath = relative(resolveApp(), path).replace(/\\/g, '/');
								const id = `${relativePath}#${e.n}`;

								return [
									`export async function ${e.n}(...args) {`,
									`  // @ts-expect-error global hook`,
									`  const resp = await window.__callServerFunction(${JSON.stringify(id)}, args);`,
									`  return resp;`,
									`}`,
									`${e.n}.$$id = ${JSON.stringify(id)};`,
									`${e.n}.$$typeof = Symbol.for('react.server.reference');`
								].join('\n');
							})
							.join('\n\n');

						return { contents: proxies, loader: 'js' };
					});
				}
			}
		]
	});

	outputFiles.forEach(async (file) => {
		// Parse file export names
		const [, exports] = parse(file.text);
		let newContents = file.text;

		for (const exp of exports) {
			// Create the id for each exported component
			// React needs this in the format <file path>#<export name>

			const relativeBuildPath = `/build/${relative(resolveBuild(), file.path)}`;
			const key = `${relativeBuildPath}#${exp.n}`;

			// Tag each component export with a special `react.client.reference` type
			// and the map key to look up import information.
			// This tells your stream renderer to avoid rendering the
			// client component server-side. Instead, import the built component
			// client-side at `clientComponentMap[key].id`
			newContents += `
${exp.ln}.$$id = ${JSON.stringify(key)};
${exp.ln}.$$typeof = Symbol.for("react.client.reference");
			`;
		}
		await writeFile(file.path, newContents);
	});
}

serve(app, async (info) => {
	await build();

	// Import all built server function modules to register them
	try {
		const buildActionsDir = resolveBuild('actions');
		const actionFiles = await readdir(buildActionsDir);
		for (const file of actionFiles) {
			if (file.endsWith('.js')) {
				const modulePath = `./build/actions/${file}`;
				await import(modulePath);
			}
		}
	} catch (err) {
		// No actions directory in build, that's fine
	}

	console.log(`Listening on http://localhost:${info.port}`);
});

/** UTILS */

const appDir = new URL('./app/', import.meta.url);
const buildDir = new URL('./build/', import.meta.url);

function resolveApp(path = '') {
	return fileURLToPath(new URL(path, appDir));
}

function resolveBuild(path = '') {
	return fileURLToPath(new URL(path, buildDir));
}

const reactComponentRegex = /\.jsx$/;
