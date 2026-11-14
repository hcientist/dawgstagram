# Dawgstagram

## Purpose

<!-- Clearly state the main idea and intended purpose of your application.
Explain a problem your application aims to solve and why it is important. -->

<blockquote cite="https://blogs.loc.gov/catbird/2021/01/for-there-is-always-light-amanda-gormans-inaugural-poem-the-hill-we-climb-delivers-message-of-unity/">"For there is always light,<br>if only we're brave enough to see it.<br>If only we're brave enough to be it."</blockquote>

_-Amanda Gorman, Poet and Activist_

While we should commit ourselves to the long, slow, never-ending work of improving ourselves and our world, we can also benefit from small sparks of joy.

**Dawgstagram facilitates personal curation and sharing of canine imagery.**

This is app is for everyone: people who already love 😍 dogs 🐶, and those who will soon!
Its purpose is to facilitate the curation and sharing "dawgs": dog images (with optional visual effects/transformations called "filters").

<!-- I doubt this meets the word count guideline... look at this first result for "vscode word count" https://github.com/microsoft/vscode-wordcount 😆 -->

## Users

<!-- Identify the primary users of your application, including their background or needs.
Justify how your application will benefit these users and improve their experience. -->

Dawgstagram values inclusivity and accessibility ("a11y").
It is designed primarily for people who love dogs and those who will soon love them.

### Background

The intended audience for Dawgstagram is people who can read and/or listen to natural language.
Those without visual impairments will be able to see the _dawgs_, and those with visual impairments will be able to hear the descriptions of the _dawgs_.
The _dawgs_ will include metadata indicating the (natural) languages their creator has added.
Creators may create _dawgs_ in whatever languages they wish.

Dawgstagram is intended to be used by people with and without programming experience.
Those creators without programming experience can apply existing filters to their _dawgs_.
Those creators with programming experience can create new filters to apply to their _dawgs_.

### Needs

The intended users of Dawgstagram include those with needs such as: 

1. to view dogs without filters or with filters (in which case we call them _dawgs_)
2. to share _dawgs_ with friends and family ("framily")

## Features

<!-- Outline the core functionalities of your application and explain how they will work.
Provide a concrete example demonstrating how the application fulfills its purpose. -->

People who use Dawgstagram will:

1. search for dog images by breed and can create, read, update, and delete (<abbr title="Create, Read, Update, Delete">CRUD</abbr>):
    * favorite dog images from
        * the [Dog API](https://dog.ceo/dog-api/)
        * images available via URL elsewhere on the web
    * custom lists of dog images
    * custom "filters" (visual transformations) for dog images
        * in their favorites or other lists, they may have filters applied to the images
2. share links that show the visitor a dog image (potentially with a filter applied)


## Data

<!-- Describe the types of data that users will create, read, update, and delete (CRUD).
Include an example of this data using either real or representative sample values. -->

### Dawg

1. src: string - http(s) url the image came from, or `opfs:<file>` for an uploaded image.
2. file: string | null - name of the copy of the image stored in the browser's [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (OPFS); `null` if the image couldn't be downloaded.
3. handle: string
4. filter: string
5. metadata: object
    1. language (string) keys map to objects with:
        1. title: string
        2. body: string

### DawgList

1. handle: string (`Favorites` is created automatically by Dawgstagram, but other lists can also be created)
2. dawgs: string[] - list of _Dawg_ handles

### Filter

1. handle: string
2. code: string
3. metadata: object
    1. language (string) keys map to objects with:
        1. title: string
        2. description: string
        3. instructions: string

## Running Dawgstagram

Dawgstagram is plain HTML, CSS, and JavaScript (ES modules): [`index.html`](index.html), [`css/`](css/), and [`js/`](js/), with no build step.
Browsers only load ES modules over `http(s)://` (not `file://`), so serve the repository folder with any static file server, for example:

* VS Code's [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension: open `index.html` → "Open with Live Server"
* `npx http-server`
* `python3 -m http.server` (from inside a virtual environment)

Everything you save lives in your browser.
Image files (uploads, and Dog API images once you favorite them or add them to a list) are stored in [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system); `localStorage` holds only dawgs, lists, and filters as JSON, with dawgs pointing to their image files by name.
Share links hold the whole dawg (image URL, filter, and descriptions) in the URL, so they work without a server; an uploaded image is put into the link itself, as a data URL.

| Path | What it does |
| --- | --- |
| `index.html` | Page shell: navbar, `<main>`, footer |
| `css/style.css` | All styles (JMU purple, teal, ice blue) |
| `js/app.js` | Hash router (`#/`, `#/favorites`, `#/lists/<name>`, `#/filters`, `#/share/…`) |
| `js/store.js` | Dawg, DawgList, and Filter CRUD, saved to `localStorage` |
| `js/images.js` | Image files in OPFS (save, read, clean up) |
| `js/opfs-worker.js` | Writes OPFS files in browsers that only allow writing from a worker |
| `js/backup.js` | Export and import (`#/backup`, linked in the footer) |
| `js/zip.js` | Minimal zip writer/reader, no library |
| `js/tones.js` | Duotone/multi-tone: turns `tones(…)` in filter code into SVG filters |
| `js/dogApi.js` | Dog API calls |
| `js/share.js` | Encodes and decodes share links |
| `js/i18n.js` | Picks the best language from `metadata` |
| `js/components.js` | Cards, menus, metadata editor, dawg editor dialog |
| `js/views/*.js` | One file per page |

Filter `code` is a [CSS `filter`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter) value, like `sepia(1) hue-rotate(90deg)`.
Unlike canvas pixel manipulation (e.g. Caman), CSS filters work on images from any website, and shared filter code can't run scripts.

Filter code can also use `tones(…)`, Dawgstagram's own function for duotone and multi-tone effects: the image is turned gray, then the darkest parts get the first color, the brightest get the last, and shades in between blend through any colors in between.
`tones(#450084, #8ee4d7)` is a duotone; it takes 2 to 8 hex colors and mixes with other functions, like `contrast(1.2) tones(#000, #450084, #fff)`.
The filter editor has color pickers that write it for you.
CSS can't do this on its own, so the app builds an [SVG filter](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feComponentTransfer) for each set of colors and points the image at it with `url(#…)`.
People can't write `url()` in filter code themselves, since a shared filter could point anywhere.

### Backups

The **Back up or restore** page (footer link) exports everything as:

* `dawgstagram-<date>.json`: dawgs, lists, and filters. Web images are downloaded again on import; uploaded images aren't included.
* `dawgstagram-<date>.zip` (when "include uploaded images" is checked): `dawgstagram.json` plus `images/<file>` for each uploaded image.

Importing accepts either and tells them apart by the file's contents, not its name. It replaces everything currently in the app (after a confirmation).

## Testing

npm is used only for tests; the app itself has no dependencies or build step.
Tests use [Playwright](https://playwright.dev/) to drive real Chromium, Firefox, and WebKit (Safari's engine) browsers.

```sh
npm install
npm run test:install-browsers   # once: downloads the test browsers
npm test                        # all browsers
npm run test:chromium           # just Chromium (fastest)
npm run test:offline            # skip tests tagged @network, which use the real Dog API
npm run test:ui                 # Playwright's interactive test runner
```

* Tests serve the app on port **4174**: a different origin than wherever you run the app, so they never see or change your own dawgs. Every test also starts with an empty browser profile.
* The Dog API is mocked (`tests/helpers.js`) so results don't depend on the network or on which random dogs come back. `tests/live.spec.js` is the exception.
* After a failure, `npx playwright show-report` shows what happened, including a trace of each failed test.
* GitHub Actions runs the tests on every push and pull request ([`.github/workflows/test.yml`](.github/workflows/test.yml)); the HTML report is attached to each run as `playwright-report`.

| File | Tests |
| --- | --- |
| `tests/store.spec.js` | Dawg/list/filter CRUD, handles, reordering, `tones()`, share links, caption language |
| `tests/images.spec.js` | OPFS storage, retries, cleanup, the older-Safari worker path |
| `tests/backup.spec.js` | Export/import (JSON and zip), bad files, a zip from another tool (`tests/fixtures/`) |
| `tests/ui.spec.js` | Clicking through the app: search, favorites, lists, editing, uploads, filters (including the duotone color pickers), sharing, backups, phone layout |
| `tests/live.spec.js` | Real Dog API; favorited images are saved from the browser cache |

## References

1. [Caman: a CAnvas MANipulation library for Javascript](https://github.com/meltingice/CamanJS)
