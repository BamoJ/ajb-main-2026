/**
 * Watches for Webflow Designer mode by observing whether the body's first child
 * has the `.w-editor-publish-node` class. Calls `onEditorView(isEditor)` once
 * synchronously and again whenever the state changes.
 *
 * Returns the initial editor state.
 */
export function handleEditor(onEditorView = null) {
	const checkEditorState = () => {
		const firstChild = document.body.firstElementChild;
		return (
			firstChild instanceof HTMLElement &&
			firstChild.classList.contains('w-editor-publish-node')
		);
	};

	let previousState = checkEditorState();
	const isEditor = previousState;

	const observer = new MutationObserver((mutations) => {
		mutations.forEach((mutation) => {
			if (mutation.type === 'childList') {
				const newIsEditor = checkEditorState();
				if (newIsEditor !== previousState) {
					if (onEditorView) onEditorView(newIsEditor);
					previousState = newIsEditor;
				}
			}
		});
	});

	observer.observe(document.body, {
		childList: true,
		subtree: false,
	});

	if (onEditorView) onEditorView(isEditor);

	return isEditor;
}
