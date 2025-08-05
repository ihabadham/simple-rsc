import { Suspense } from 'react';
import { getAll } from '../data/db.js';
import { getValue } from '../server/state.js';
import Like from './Like.jsx';
import ActionButton from './ActionButton.jsx';

async function Albums() {
	const albums = await getAll();
	return (
		<ul>
			{albums.map((a) => (
				<li key={a.id} className="flex gap-2 items-center mb-2">
					<img className="w-20 aspect-square" src={a.cover} alt={a.title} />
					<div>
						<h3 className="text-xl">{a.title}</h3>
						<p>{a.songs.length} songs</p>
						<Like />
					</div>
				</li>
			))}
		</ul>
	);
}

function CounterDemo() {
	const count = getValue('incrementCounter');
	return (
		<div className="border-t pt-6 mt-6">
			<h2 className="text-2xl mb-3">Server Actions Demo (shared across tabs)</h2>
			<p className="text-xl mb-4">Server value: {count}</p>
			<ActionButton actionName="incrementCounter">+1</ActionButton>
		</div>
	);
}

export default async function Page() {
	return (
		<>
			<h1 className="text-3xl mb-3">Spotifn&apos;t</h1>
			<Suspense fallback="Getting albums">
				<Albums />
			</Suspense>
			<CounterDemo />
		</>
	);
}
