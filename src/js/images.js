/**
 * Image storage in the Origin Private File System (OPFS):
 * https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
 *
 * localStorage only holds small JSON, so image bytes live here, in an
 * "images" directory, and dawgs keep just the file name (their `file` field).
 *
 *   saveBlob(blob)      -> file name
 *   saveFromUrl(url)    -> file name, or null if the image can't be downloaded
 *   objectUrl(file)     -> a blob: URL an <img> can display
 *   removeUnused(files) -> delete every stored image not in `files`
 */

const DIR = 'images';
export const OPFS_PREFIX = 'opfs:';

export const isSupported = () => typeof navigator.storage?.getDirectory === 'function';

/**
 * The images directory. Looked up each time (it's cheap) rather than cached,
 * so things keep working if site data is cleared while the page is open.
 */
async function dir() {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(DIR, { create: true });
}

/* ---------- writing ---------- */

/**
 * Most browsers can write from the page with createWritable(). Older Safari
 * only allows writes from a worker (createSyncAccessHandle), so fall back to one.
 */
async function writeFile(name, blob) {
    requestPersistence();
    try {
        const handle = await (await dir()).getFileHandle(name, { create: true });
        if (typeof handle.createWritable === 'function') {
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
        } else {
            await writeInWorker(name, blob);
        }
    } catch (error) {
        // Safari private windows, for example, have OPFS but refuse to use it.
        console.warn('OPFS write failed', error);
        throw new Error(error?.name === 'QuotaExceededError'
            ? 'This browser is out of space for images. Try removing some dawgs.'
            : 'This browser won’t let Dawgstagram store images. Private browsing windows often don’t allow it.');
    }
}

let worker;
let nextJob = 0;
const jobs = new Map();
function writeInWorker(name, blob) {
    if (!worker) {
        worker = new Worker(new URL('./opfs-worker.js', import.meta.url));
        worker.onmessage = ({ data }) => {
            const job = jobs.get(data.id);
            jobs.delete(data.id);
            data.error ? job.reject(new Error(data.error)) : job.resolve();
        };
    }
    return new Promise((resolve, reject) => {
        const id = ++nextJob;
        jobs.set(id, { resolve, reject });
        worker.postMessage({ id, dir: DIR, name, blob });
    });
}

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
const extensionFor = (type) => EXTENSIONS[type] ?? 'img';

async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Store an image blob (e.g. an upload) under a new random name. */
export async function saveBlob(blob) {
    if (!blob.type.startsWith('image/')) throw new Error('That file isn’t an image.');
    const name = `${crypto.randomUUID()}.${extensionFor(blob.type)}`;
    await writeFile(name, blob);
    return name;
}

/**
 * Download an image and store it. The name comes from a hash of the URL, so
 * saving the same URL twice reuses one file. Returns null if the download
 * fails (many sites don't allow other pages to fetch their images); the dawg
 * then just shows the image from its URL.
 */
export async function saveFromUrl(url) {
    if (!isSupported()) return null;
    try {
        const hash = await sha256(url);
        const existing = await findFile((name) => name.startsWith(`${hash}.`));
        if (existing) return existing;
        const response = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error(`not an image (${blob.type})`);
        const name = `${hash}.${extensionFor(blob.type)}`;
        await writeFile(name, blob);
        return name;
    } catch (error) {
        console.info(`Couldn’t store a copy of ${url}; will load it from the web instead.`, error);
        return null;
    }
}

/**
 * Hosts whose images send `Access-Control-Allow-Origin: *`. Images from
 * anywhere else are shown in the default (no-cors) mode, because asking for
 * CORS from a host that doesn't allow it would stop the image from loading.
 */
const CORS_HOSTS = new Set(['images.dog.ceo']);

export function allowsCors(url) {
    try {
        return CORS_HOSTS.has(new URL(url).hostname);
    } catch {
        return false;
    }
}

/** Turn a data: URL (from an old save or a share link) into a stored file. */
export async function saveDataUrl(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    return saveBlob(blob);
}

/* ---------- reading ---------- */

async function findFile(predicate) {
    for await (const name of (await dir()).keys()) if (predicate(name)) return name;
    return null;
}

/** Is there a stored image with this name? */
export async function exists(file) {
    if (!isSupported()) return false;
    try {
        await (await dir()).getFileHandle(file);
        return true;
    } catch {
        return false;
    }
}

export async function getBlob(file) {
    return (await (await dir()).getFileHandle(file)).getFile();
}

const objectUrls = new Map(); // file name -> Promise<blob: URL>

/** A blob: URL for a stored image (cached, so each file is read once). */
export function objectUrl(file) {
    if (!objectUrls.has(file)) {
        const promise = getBlob(file).then((blob) => URL.createObjectURL(blob));
        promise.catch(() => objectUrls.delete(file));
        objectUrls.set(file, promise);
    }
    return objectUrls.get(file);
}

/** Read a stored image as a data: URL (used to put uploads into share links). */
export async function dataUrl(file) {
    const blob = await getBlob(file);
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/* ---------- cleanup ---------- */

/**
 * Delete stored images that no dawg refers to any more. Files written in the
 * last minute are kept: they may belong to a dawg that's about to be saved.
 */
export async function removeUnused(usedFiles) {
    if (!isSupported()) return;
    const directory = await dir();
    const unused = [];
    const cutoff = Date.now() - 60_000;
    for await (const [name, handle] of directory.entries()) {
        if (usedFiles.has(name)) continue;
        const file = await handle.getFile().catch(() => null);
        if (file && file.lastModified < cutoff) unused.push(name);
    }
    for (const name of unused) {
        await directory.removeEntry(name).catch(() => {});
        const url = objectUrls.get(name);
        objectUrls.delete(name);
        url?.then(URL.revokeObjectURL, () => {});
    }
}

let askedForPersistence = false;
/** Ask (once) for the browser not to evict our files when disk space runs low. */
function requestPersistence() {
    if (askedForPersistence) return;
    askedForPersistence = true;
    navigator.storage?.persist?.().catch(() => {});
}
