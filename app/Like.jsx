'use client';

import { startTransition } from 'react';

export default function Like({ albumId }) {
	async function handleLike() {
		// Phase 1: Manual call to server function via registry
		// @ts-expect-error window.__callServerFunction is globally available
		const resp = await window.__callServerFunction('album#likeAlbum', [albumId]);

		// Re-render with updated server state
		// @ts-expect-error window.__renderRSC is globally available
		startTransition(() => window.__renderRSC(resp));
	}

	return <button onClick={handleLike}>♥ Like</button>;
}
