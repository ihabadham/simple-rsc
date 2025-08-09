'use client';

import { startTransition } from 'react';
import { likeAlbum } from './actions/album.js';

export default function Like({ albumId }) {
	async function handleLike() {
		// Call server function and refresh UI with updated state
		const resp = await likeAlbum(albumId);

		// Re-render with updated server state
		// @ts-expect-error window.__renderRSC is globally available
		startTransition(() => window.__renderRSC(resp));
	}

	return <button onClick={handleLike}>♥ Like</button>;
}
