# TMT Bridge Lens v10

A clean, fast browser extension for the Google TMT Hackathon 2026 Extension Track.

It translates visible webpage text between **English**, **Nepali**, and **Tamang** using the TMT API. v10 is intentionally simple: choose **Source**, choose **Destination**, then translate the page or the selected text.

## Why this version is competition-ready

- Simple popup: no confusing preset route buttons.
- Source and Destination dropdowns support all required directions.
- Bilingual mode preserves the original text and places the translation beside/below it.
- Replace mode turns the page into the destination language.
- Selection translation opens a floating translation card.
- Fast batch pipeline: deduplicates sentences, translates in batches, caches previous translations, and uses a small concurrent queue.
- Private token storage: the API key is kept in local extension storage, not in source code.
- Restore button returns the page to its original text.
- Options page includes token setup, API test, cache clear, and performance profile.

## Supported language pairs

- English ↔ Nepali
- English ↔ Tamang
- Nepali ↔ Tamang

## Installation in Chrome

1. Unzip this project.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `tmt_bridge_lens_v10` folder.
6. Open the extension **Options** page.
7. Paste your private team token and click **Save settings**.
8. Click **Test English → Tamang** to verify the API.

## Demo flow for judges

1. Open any normal webpage with English/Nepali text. For the included demo file, either enable Chrome “Allow access to file URLs” for the extension or serve the folder locally.
2. Open `demo/test-page.html` if you are using the included demo page.
3. Click the extension icon.
4. Set Source = `English`, Destination = `Tamang`.
5. Keep mode = `Bilingual`.
6. Click **Translate page**.
7. Show that the original page text remains visible and the translation is attached.
8. Highlight one sentence and click **Translate selection**.
9. Switch mode to `Replace` and translate again to show full-page replacement.
10. Click **Restore page**.

## Project structure

```text
manifest.json
src/
  background.js   # API calls, queue, cache, active-tab orchestration
  content.js      # webpage scanning, bilingual/replace rendering, floating panel
  popup.html      # simple popup UI
  popup.css
  popup.js
  options.html    # token, endpoint, speed profile, cache controls
  options.css
  options.js
assets/           # extension icons
demo/             # local demo page
docs/             # architecture, demo script, judge checklist
scripts/          # packaging helper
.env.example      # safe config example; do not put real token in GitHub
```

## Security notes

- Never hardcode your real team token.
- The extension stores the token in `chrome.storage.local`.
- The token is used only by the background service worker when calling the TMT API.
- `.env.example` is included only as documentation for deployment/review.

## Performance notes

The default profile is **Fast demo**, which uses:

- 3 concurrent requests
- 80 ms delay between request starts
- local sentence cache
- duplicate sentence elimination
- visible-text prioritization

If the API becomes slow or rate-limited, open Options and choose **Gentle API**.



## License

MIT
