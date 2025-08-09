'use server';

import { getValue, setValue } from '../../server/state.js';
import { registerServerFunction } from '../../server/server-functions.js';

export async function likeAlbum(albumId) {
	const key = `like-${albumId}`;
	const current = getValue(key, 0);
	setValue(key, current + 1);
}

// Phase 1: Manual registration (build transforms will handle this later)
registerServerFunction('album#likeAlbum', likeAlbum);
