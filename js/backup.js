/**
 * Export and import all Dawgstagram data.
 *
 *   dawgstagram-<date>.json  dawgs, lists, and filters. Web images are
 *                            downloaded again after importing; uploaded
 *                            images are not included.
 *   dawgstagram-<date>.zip   the same JSON (as dawgstagram.json) plus every
 *                            uploaded image, in images/<file>.
 *
 * Import looks at the file's first bytes, not its name, to tell a zip from JSON.
 */

import * as store from './store.js';
import * as images from './images.js';
import { createZip, readZip, isZip } from './zip.js';

const APP = 'dawgstagram';
const VERSION = 1;
const JSON_NAME = 'dawgstagram.json';
const IMAGE_DIR = 'images/';

const isUpload = (dawg) => dawg.src.startsWith(images.OPFS_PREFIX);

/** How many dawgs use uploaded images (what a zip export would add). */
export const uploadCount = () => store.allDawgs().filter(isUpload).length;

/**
 * Build a backup file.
 * @param {{ includeUploads: boolean }} options
 * @returns {Promise<{ blob: Blob, filename: string, missing: number }>}
 *   `missing` counts uploaded images that couldn't be read from OPFS.
 */
export async function createBackup({ includeUploads }) {
    const data = store.snapshot();
    const json = JSON.stringify({ app: APP, version: VERSION, exportedAt: new Date().toISOString(), ...data }, null, 2);
    const stamp = new Date().toISOString().slice(0, 10);

    if (!includeUploads) {
        return { blob: new Blob([json], { type: 'application/json' }), filename: `${APP}-${stamp}.json`, missing: 0 };
    }

    const entries = [{ name: JSON_NAME, data: json }];
    const added = new Set();
    let missing = 0;
    for (const dawg of Object.values(data.dawgs).filter(isUpload)) {
        if (!dawg.file || added.has(dawg.file)) continue;
        try {
            entries.push({ name: IMAGE_DIR + dawg.file, data: await images.getBlob(dawg.file) });
            added.add(dawg.file);
        } catch {
            missing++;
        }
    }
    return { blob: await createZip(entries), filename: `${APP}-${stamp}.zip`, missing };
}

/** Ask the browser to save `blob` as a download named `filename`. */
export function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml' };
const mimeFor = (name) => MIME[name.split('.').pop().toLowerCase()] ?? 'image/jpeg';

/**
 * Read a backup file (JSON or zip) without changing anything yet.
 * @returns {Promise<{ data: object, imageFiles: Map<string, Uint8Array>, summary: object }>}
 */
export async function readBackup(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text;
    let imageFiles = new Map();

    if (isZip(bytes)) {
        const files = await readZip(bytes);
        const jsonBytes = files.get(JSON_NAME)
            ?? [...files].find(([name]) => name.endsWith(`/${JSON_NAME}`))?.[1]; // zipped inside a folder
        if (!jsonBytes) throw new Error(`That zip doesn’t contain ${JSON_NAME}.`);
        text = new TextDecoder().decode(jsonBytes);
        for (const [name, contents] of files) {
            const i = name.lastIndexOf(IMAGE_DIR);
            if (i !== -1 && !name.endsWith('/')) imageFiles.set(name.slice(i + IMAGE_DIR.length), contents);
        }
    } else {
        text = new TextDecoder().decode(bytes);
    }

    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('That file isn’t a Dawgstagram backup (it’s not JSON or a zip).');
    }
    if (parsed?.app && parsed.app !== APP) throw new Error('That file isn’t a Dawgstagram backup.');
    const data = store.normalizeData(parsed);

    const dawgs = Object.values(data.dawgs);
    let uploadsMissing = 0;
    for (const dawg of dawgs.filter(isUpload)) {
        const name = dawg.src.slice(images.OPFS_PREFIX.length);
        if (!imageFiles.has(name) && !(await images.exists(name))) uploadsMissing++;
    }
    const summary = {
        dawgs: dawgs.length,
        lists: Object.keys(data.lists).length,
        filters: Object.keys(data.filters).length,
        uploadsMissing,
    };
    return { data, imageFiles, summary };
}

/**
 * Replace all current data with a backup read by readBackup().
 * Uploaded images from the zip are written to OPFS; web images are downloaded
 * again in the background. Images no longer used are cleaned up afterwards.
 */
export async function applyBackup({ data, imageFiles }) {
    for (const dawg of Object.values(data.dawgs)) {
        if (isUpload(dawg)) {
            const name = dawg.src.slice(images.OPFS_PREFIX.length);
            const contents = imageFiles.get(name);
            if (contents) {
                const file = await images.saveBlob(new Blob([contents], { type: mimeFor(name) }));
                dawg.src = images.OPFS_PREFIX + file;
                dawg.file = file;
            } else if (await images.exists(name)) {
                dawg.file = name; // re-importing in the browser it came from: the image is still here
            } else {
                dawg.file = null; // the image wasn't in the backup; the dawg keeps its descriptions
            }
        } else {
            dawg.file = null; // OPFS file names from another browser mean nothing here
        }
    }
    store.replaceAll(data);
    store.storeMissingImages(); // re-download web images, convert data: URLs, clean up
}
