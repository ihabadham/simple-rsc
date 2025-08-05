'use client';
import { startTransition } from 'react';

export default function ActionButton({ actionName, children }) {
	async function run() {
		const resp = await fetch(`/actions/${actionName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				/* arbitrary args */
			})
		});

		// Swap in the new tree without blocking UI
		// @ts-expect-error window.__renderRSC is globally available
		startTransition(() => window.__renderRSC(resp));
	}

	return <button onClick={run}>{children}</button>;
}
