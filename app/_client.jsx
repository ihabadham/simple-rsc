import { createRoot } from 'react-dom/client';
import { createFromFetch } from 'react-server-dom-esm/client';

// @ts-expect-error `root` might be null
const root = createRoot(document.getElementById('root'));
// @ts-expect-error adding to window global
window.__rscRoot = root;

/**
 * Reusable function to render RSC from any source
 * @param {string | Response} src - URL string or Response object
 */
function renderRSC(src) {
	// src can be a URL string *or* a Response object
	const promise = typeof src === 'string' ? fetch(src) : Promise.resolve(src);
	createFromFetch(promise).then((node) => root.render(node));
}

/**
 * Call a server function by id and return the RSC response
 * @param {string} id - Server function id
 * @param {any[]} args - Arguments to pass to the function
 */
async function callServerFunction(id, args) {
	const resp = await fetch('/server-fn', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ id, args })
	});
	return resp; // pass to __renderRSC
}

// @ts-expect-error adding to window global
window.__renderRSC = renderRSC; // export for client components
// @ts-expect-error adding to window global
window.__callServerFunction = callServerFunction; // export for server function calls

// Initial page load
renderRSC('/rsc');
