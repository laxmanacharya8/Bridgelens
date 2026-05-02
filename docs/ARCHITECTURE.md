# Architecture

TMT Bridge Lens v10 is built around a small and reliable extension architecture.

## 1. Popup

The popup is intentionally minimal:

- Source language dropdown
- Destination language dropdown
- Swap button
- Bilingual / Replace mode
- Translate page
- Translate selection
- Restore page
- Quick text translator

The popup stores the current source, destination, and mode in `chrome.storage.sync`.

## 2. Background service worker

`src/background.js` is the only layer that talks to the TMT API.

Responsibilities:

- Read the private team token from `chrome.storage.local`
- Normalize language codes
- Split quick text into sentence-level requests
- Deduplicate repeated sentences
- Cache sentence translations
- Queue requests with configurable concurrency and delay
- Inject/verify the content script when needed
- Relay page actions to the active tab

This keeps the API token away from webpage JavaScript.

## 3. Content script

`src/content.js` runs inside the page and handles UI/page transformation.

Responsibilities:

- Collect visible text nodes
- Skip unsafe or noisy elements such as scripts, inputs, code blocks, iframes and extension UI
- Prioritize text currently near the viewport
- Split text nodes into sentence-sized pieces
- Ask the background worker for batch translations
- Render either bilingual annotations or replacement text
- Restore the page to its original state
- Show a floating panel for progress and selection translations

## 4. Translation pipeline

1. Content script scans visible text.
2. It builds a sentence list and removes duplicates.
3. It sends a batch to the background worker.
4. The background worker checks cache and in-flight requests.
5. Missing sentences are queued and sent to the TMT API.
6. Results return to the content script.
7. The content script reconstructs each text node.
8. The selected mode is applied to the page.

## 5. v10 simplification choices

Removed from earlier versions:

- Preset English → Tamang buttons in popup
- Auto-detect source language
- Round-trip/back-translation UI
- Live mutation translation
- Overly dense advanced controls

These were removed to make the demo simpler, faster and less error-prone.
