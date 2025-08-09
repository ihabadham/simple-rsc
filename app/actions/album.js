'use server';

import { getValue, setValue } from '../../server/state.js';

export async function likeAlbum(albumId) {
	const key = `like-${albumId}`;
	const current = getValue(key, 0);
	setValue(key, current + 1);
}
