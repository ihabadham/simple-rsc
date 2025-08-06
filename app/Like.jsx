'use client';

import { startTransition } from 'react';

export default function Like({ albumId }) {
	async function handleLike() {
		const resp = await fetch(`/actions/like-${albumId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({})
		});

		// Re-render with updated server state
		// @ts-expect-error window.__renderRSC is globally available
		startTransition(() => window.__renderRSC(resp));
	}

	return <button onClick={handleLike}>♥ Like</button>;
}
