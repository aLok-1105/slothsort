import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';
function App() {
	const [items, setItems] = useState([]),
		[selected, setSelected] = useState([]),
		[directory, setDirectory] = useState(null),
		[busy, setBusy] = useState(false),
		[message, setMessage] = useState('');
	async function scan() {
		if (!('showDirectoryPicker' in window)) {
			setMessage(
				'Folder selection requires a recent version of Chrome or Edge.',
			);
			return;
		}
		setBusy(true);
		try {
			const handle = await window.showDirectoryPicker({
				mode: 'readwrite',
			});
			setDirectory(handle);
			setItems([]);
			setSelected([]);
			const files = [];
			for await (const [name, entry] of handle.entries()) {
				if (entry.kind === 'file') files.push({ name, handle: entry });
			}
			const results = [];
			for (const { name, handle: fileHandle } of files.slice(0, 100)) {
				try {
					const file = await fileHandle.getFile();
					if (file.size > 10 * 1024 * 1024) {
						results.push({
							file: name,
							error: 'File exceeds 10 MB limit',
						});
						continue;
					}
					setMessage(
						`Classifying ${results.length + 1} of ${Math.min(files.length, 100)} files...`,
					);
					const form = new FormData();
					form.append('file', file, name);
					const response = await fetch('http://localhost:3001/api/classify', {
						method: 'POST',
						body: form,
					});
					const result = await response.json();
					if (!response.ok)
						throw Error(result.error || 'Could not classify file');
					results.push({
						...result,
						handle: fileHandle,
						size: file.size,
						lastModified: file.lastModified,
					});
				} catch (error) {
					results.push({ file: name, error: error.message });
				}
				setItems([...results]);
			}
			setItems(results);
			setMessage(
				files.length > 100
					? `Scanned 100 of ${files.length} files. Review suggestions before applying.`
					: `Scanned ${files.length} files. Review suggestions before applying.`,
			);
		} catch (e) {
			if (e.name !== 'AbortError') setMessage(e.message);
		} finally {
			setBusy(false);
		}
	}
	async function apply() {
		if (!directory) return;
		setBusy(true);
		try {
			const results = [];
			for (const item of items.filter((x) => selected.includes(x.id))) {
				try {
					const source = await item.handle.getFile();
					if (
						source.size !== item.size ||
						source.lastModified !== item.lastModified
					)
						throw Error('File changed since preview');
					const targetDirectory = await directory.getDirectoryHandle(
						item.category,
						{ create: true },
					);
					const proposedName = item.target.slice(
						item.target.indexOf('/') + 1,
					);
					const dotIndex = proposedName.lastIndexOf('.');
					const baseName =
						dotIndex > 0
							? proposedName.slice(0, dotIndex)
							: proposedName;
					const extension =
						dotIndex > 0 ? proposedName.slice(dotIndex) : '';
					let targetName = proposedName;
					let suffix = 1;
					while (true) {
						try {
							await targetDirectory.getFileHandle(targetName);
							targetName = `${baseName}-${suffix++}${extension}`;
						} catch (error) {
							if (error.name === 'NotFoundError') break;
							throw error;
						}
					}
					const target = await targetDirectory.getFileHandle(
						targetName,
						{ create: true },
					);
					const writable = await target.createWritable();
					await writable.write(source);
					await writable.close();
					await directory.removeEntry(item.file);
					results.push({
						id: item.id,
						message: `Moved ${item.file} → ${item.category}/${targetName}`,
					});
				} catch (error) {
					results.push({
						id: item.id,
						message: `${item.file}: ${error.message}`,
						error: true,
					});
				}
			}
			setMessage(results.map((result) => result.message).join('\n'));
			setItems(
				items.filter(
					(item) =>
						!results.some(
							(result) =>
								result.id === item.id && !result.error,
						),
				),
			);
			setSelected([]);
		} catch (e) {
			setMessage(e.message);
		} finally {
			setBusy(false);
		}
	}
	return (
		<main>
			<header>
				<h1>🦥 SlothSort</h1>
				<p>Private, local AI file organizer</p>
			</header>
			<section>
				<h2>1. Preview suggestions</h2>
				<p>
					Choose any folder on your computer. Only its top-level files
					are scanned; approved files are moved into category folders.
				</p>
				<button disabled={busy} onClick={scan}>
					{busy ? 'Working...' : 'Choose folder & scan'}
				</button>
			</section>
			<section>
				<h2>2. Approve changes</h2>
				<p>
					AI suggestions are not guaranteed correct. Select only
					the files you want to move.
				</p>
				{items.map((x, i) => (
					<article key={x.id || i}>
						<label>
							{x.id && (
								<input
									type='checkbox'
									checked={selected.includes(x.id)}
									onChange={(e) =>
										setSelected(
											e.target.checked
												? [
														...selected,
														x.id,
													]
												: selected.filter(
														(y) =>
															y !==
															x.id,
													),
										)
									}
								/>
							)}
							<strong>{x.file}</strong>
						</label>
						{x.error ? (
							<p className='error'>{x.error}</p>
						) : (
							<>
								<p>→ {x.target}</p>
								<small>{x.reason}</small>
								{x.confidence !== null &&
									x.confidence !== undefined && (
										<small>
											{' '}
											· AI confidence:{' '}
											{Math.round(x.confidence * 100)}%
										</small>
									)}
								{x.tags?.length > 0 && (
									<small> · Tags: {x.tags.join(', ')}</small>
								)}
							</>
						)}
					</article>
				))}
				<button disabled={busy || !selected.length} onClick={apply}>
					Apply {selected.length} approved changes
				</button>
			</section>
			<pre>{message}</pre>
		</main>
	);
}
createRoot(document.getElementById('root')).render(<App />);
