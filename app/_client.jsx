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

// @ts-expect-error adding to window global
window.__renderRSC = renderRSC; // export for client components

// Initial page load
renderRSC('/rsc');
