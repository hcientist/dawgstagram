/**
 * All app data, persisted to localStorage. Shapes follow the README's "Data" section:
 *
 *   Dawg     { handle, src, file, filter, metadata: { [lang]: { title, body } } }
 *   DawgList { handle, dawgs: string[] }          // dawg handles
 *   Filter   { handle, code, metadata: { [lang]: { title, description, instructions } } }
 *
 * A Dawg's image bytes live in OPFS (see images.js); localStorage only keeps
 * references. `file` is the OPFS file name (null if the image couldn't be
 * downloaded). `src` is where the image came from: an http(s) URL, or
 * "opfs:<file>" for uploads.
 *
 * `filter` on a Dawg is a Filter handle ('' for none). A Filter's `code` is a
 * CSS filter value, e.g. "sepia(0.8) contrast(1.2)".
 *
 * Every mutation saves and then notifies subscribers, so views can re-render.
 */

import * as images from './images.js';

const STORAGE_KEY = 'dawgstagram:v1';
export const FAVORITES = 'Favorites';

const SEED_FILTERS = [
    ['Grayscale', 'grayscale(1)', 'Removes all color.'],
    ['Sepia', 'sepia(1)', 'A warm, old-timey brown tone.'],
    ['Vintage', 'sepia(0.5) contrast(1.1) saturate(1.4) brightness(0.95)', 'Faded film-photo look.'],
    ['Pop', 'saturate(2) contrast(1.15)', 'Extra-vivid colors.'],
    ['Invert', 'invert(1)', 'Swaps every color for its opposite.'],
    ['Purple Pride', 'sepia(1) hue-rotate(220deg) saturate(2.5)', 'Tints everything JMU purple.'],
    ['Dreamy', 'blur(2px) brightness(1.1) saturate(1.2)', 'Soft focus and bright.'],
].map(([title, code, description]) => ({
    handle: slugify(title),
    code,
    metadata: { en: { title, description, instructions: 'Choose this filter from the filter menu on any dawg.' } },
}));

function emptyState() {
    return {
        dawgs: {},
        lists: { [FAVORITES]: { handle: FAVORITES, dawgs: [] } },
        filters: Object.fromEntries(SEED_FILTERS.map((f) => [f.handle, f])),
    };
}

function load() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (saved?.dawgs && saved?.lists && saved?.filters) {
            saved.lists[FAVORITES] ??= { handle: FAVORITES, dawgs: [] };
            return saved;
        }
    } catch (error) {
        console.warn('Could not read saved Dawgstagram data; starting fresh.', error);
    }
    return emptyState();
}

let state = load();
const listeners = new Set();

/** Thrown when localStorage is full (usually from big uploaded images). */
export class StorageFullError extends Error {}

function commit() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        state = load(); // roll back to the last saved state
        listeners.forEach((fn) => fn(state));
        throw new StorageFullError('Your browser storage is full. Try removing some dawgs.');
    }
    listeners.forEach((fn) => fn(state));
    scheduleImageCleanup();
}

let cleanupTimer;
/** Soon after changes settle, delete OPFS images no dawg uses. */
function scheduleImageCleanup() {
    clearTimeout(cleanupTimer);
    cleanupTimer = setTimeout(() => {
        const used = new Set(allDawgs().map((d) => d.file).filter(Boolean));
        images.removeUnused(used).catch((error) => console.warn('Image cleanup failed', error));
    }, 1000);
}

/** Call `fn` after every change. Returns an unsubscribe function. */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// Also pick up changes made in other tabs.
window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
        state = load();
        listeners.forEach((fn) => fn(state));
    }
});

/* ---------- handles ---------- */

export function slugify(text) {
    return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'dawg';
}

function uniqueHandle(base, taken) {
    let handle = base;
    for (let n = 2; handle in taken; n++) handle = `${base}-${n}`;
    return handle;
}

const firstTitle = (metadata) => Object.values(metadata ?? {})[0]?.title;

/* ---------- Dawgs ---------- */

export const getDawg = (handle) => state.dawgs[handle];
export const allDawgs = () => Object.values(state.dawgs);
export const findDawgBySrc = (src) => allDawgs().find((d) => d.src === src);

export function createDawg({ src, file = null, filter = '', metadata = {} }) {
    const handle = uniqueHandle(slugify(firstTitle(metadata) ?? 'dawg'), state.dawgs);
    state.dawgs[handle] = { handle, src, file, filter, metadata };
    commit();
    return handle;
}

export function updateDawg(handle, changes) {
    if (!state.dawgs[handle]) return;
    state.dawgs[handle] = { ...state.dawgs[handle], ...changes, handle };
    commit();
}

export function deleteDawg(handle) {
    delete state.dawgs[handle];
    for (const list of Object.values(state.lists)) list.dawgs = list.dawgs.filter((h) => h !== handle);
    commit();
}

/** Dawgs only exist while they are in at least one list. */
function removeOrphans() {
    removeOrphansFrom(state);
}

const pendingDawgs = new Map(); // src -> Promise<handle>, so a double-click doesn't make two dawgs

/**
 * Find the dawg for an image URL, or download the image into OPFS and create
 * the dawg. Resolves to its handle.
 */
export function ensureDawg(src, metadata) {
    const existing = findDawgBySrc(src);
    if (existing) return Promise.resolve(existing.handle);
    if (!pendingDawgs.has(src)) {
        const promise = images.saveFromUrl(src)
            .then((file) => findDawgBySrc(src)?.handle ?? createDawg({ src, file, metadata }))
            .finally(() => pendingDawgs.delete(src));
        pendingDawgs.set(src, promise);
    }
    return pendingDawgs.get(src);
}

/**
 * Move image data into OPFS for dawgs that don't have it there yet: data: URLs
 * saved by older versions of Dawgstagram, and web images not yet downloaded.
 * Then remove any stored images nothing uses.
 */
export async function storeMissingImages() {
    if (!images.isSupported()) return;
    for (const dawg of allDawgs()) {
        if (dawg.file) continue;
        try {
            if (dawg.src.startsWith('data:')) {
                const file = await images.saveDataUrl(dawg.src);
                updateDawg(dawg.handle, { file, src: `${images.OPFS_PREFIX}${file}` });
            } else if (/^https?:/i.test(dawg.src)) {
                const file = await images.saveFromUrl(dawg.src);
                if (file) updateDawg(dawg.handle, { file });
            }
        } catch (error) {
            console.warn(`Couldn’t move the image for ${dawg.handle} into OPFS`, error);
        }
    }
    scheduleImageCleanup();
}

/* ---------- DawgLists ---------- */

export const getList = (handle) => state.lists[handle];

/** Favorites first, then the rest alphabetically. */
export function allLists() {
    const { [FAVORITES]: favorites, ...rest } = state.lists;
    return [favorites, ...Object.values(rest).sort((a, b) => a.handle.localeCompare(b.handle))];
}

export const listsContaining = (dawgHandle) => allLists().filter((l) => l.dawgs.includes(dawgHandle));

export function createList(name) {
    const handle = name.trim();
    if (!handle) throw new Error('A list needs a name.');
    if (state.lists[handle]) throw new Error(`There is already a list named “${handle}”.`);
    state.lists[handle] = { handle, dawgs: [] };
    commit();
    return handle;
}

export function renameList(oldHandle, newName) {
    const handle = newName.trim();
    if (oldHandle === FAVORITES) throw new Error('Favorites can’t be renamed.');
    if (!handle) throw new Error('A list needs a name.');
    if (handle === oldHandle) return handle;
    if (state.lists[handle]) throw new Error(`There is already a list named “${handle}”.`);
    state.lists[handle] = { ...state.lists[oldHandle], handle };
    delete state.lists[oldHandle];
    commit();
    return handle;
}

export function deleteList(handle) {
    if (handle === FAVORITES) throw new Error('Favorites can’t be deleted.');
    delete state.lists[handle];
    removeOrphans();
    commit();
}

/**
 * Add a dawg to a list (Favorites included). A dawg in a list is one the
 * viewer wants to keep, so this also makes sure its image is stored in OPFS.
 */
export function addToList(listHandle, dawgHandle) {
    const list = state.lists[listHandle];
    if (!list) return;
    if (!list.dawgs.includes(dawgHandle)) {
        list.dawgs.unshift(dawgHandle); // newest first
        commit();
    }
    persistImage(dawgHandle);
}

const persisting = new Set(); // dawg handles whose image is being saved right now

/**
 * In the background, store a web image in OPFS if the dawg doesn't have a
 * copy yet (e.g. an earlier download failed). Safe to call repeatedly.
 */
function persistImage(dawgHandle) {
    const dawg = state.dawgs[dawgHandle];
    if (!dawg || dawg.file || !/^https?:/i.test(dawg.src) || persisting.has(dawgHandle)) return;
    persisting.add(dawgHandle);
    images.saveFromUrl(dawg.src)
        .then((file) => {
            const current = state.dawgs[dawgHandle];
            if (file && current && !current.file && current.src === dawg.src) updateDawg(dawgHandle, { file });
        })
        .finally(() => persisting.delete(dawgHandle));
}

export function removeFromList(listHandle, dawgHandle) {
    const list = state.lists[listHandle];
    if (!list) return;
    list.dawgs = list.dawgs.filter((h) => h !== dawgHandle);
    removeOrphans();
    commit();
}

/** Move a dawg one place earlier (-1) or later (+1) in a list. */
export function moveInList(listHandle, dawgHandle, delta) {
    const dawgs = state.lists[listHandle]?.dawgs;
    const from = dawgs?.indexOf(dawgHandle) ?? -1;
    const to = from + delta;
    if (from === -1 || to < 0 || to >= dawgs.length) return;
    [dawgs[from], dawgs[to]] = [dawgs[to], dawgs[from]];
    commit();
}

export const isFavorite = (src) => {
    const dawg = findDawgBySrc(src);
    return !!dawg && state.lists[FAVORITES].dawgs.includes(dawg.handle);
};

/* ---------- Filters ---------- */

export const getFilter = (handle) => state.filters[handle];
export const allFilters = () =>
    Object.values(state.filters).sort((a, b) => (firstTitle(a.metadata) ?? a.handle).localeCompare(firstTitle(b.metadata) ?? b.handle));
export const findFilterByCode = (code) => allFilters().find((f) => f.code === code);

/** The CSS filter value for a dawg (or '' if it has none). */
export const filterCss = (dawg) => state.filters[dawg?.filter]?.code ?? '';

export function createFilter({ code, metadata = {} }) {
    const handle = uniqueHandle(slugify(firstTitle(metadata) ?? 'filter'), state.filters);
    state.filters[handle] = { handle, code, metadata };
    commit();
    return handle;
}

export function updateFilter(handle, changes) {
    if (!state.filters[handle]) return;
    state.filters[handle] = { ...state.filters[handle], ...changes, handle };
    commit();
}

export function deleteFilter(handle) {
    delete state.filters[handle];
    for (const dawg of allDawgs()) if (dawg.filter === handle) dawg.filter = '';
    commit();
}

/** Is `code` something the browser accepts as a CSS `filter` value? External url() references are not allowed. */
export function isValidFilterCode(code) {
    return code.trim() === '' || (!/url\s*\(/i.test(code) && CSS.supports('filter', code));
}

/* ---------- backup ---------- */

/** A copy of all data (dawgs, lists, filters), for exporting. */
export const snapshot = () => structuredClone(state);

/**
 * Check imported data and clean it up: drop anything malformed, keep list
 * entries only for dawgs that exist, and always have Favorites.
 * Throws if it isn't Dawgstagram data at all.
 */
export function normalizeData(data) {
    const isObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
    if (!isObject(data) || !isObject(data.dawgs) || !isObject(data.lists) || !isObject(data.filters)) {
        throw new Error('That file isn’t a Dawgstagram backup.');
    }
    const result = { dawgs: {}, lists: {}, filters: {} };

    for (const [handle, f] of Object.entries(data.filters)) {
        if (isObject(f) && typeof f.code === 'string' && isValidFilterCode(f.code)) {
            result.filters[handle] = { handle, code: f.code, metadata: isObject(f.metadata) ? f.metadata : {} };
        }
    }
    for (const [handle, d] of Object.entries(data.dawgs)) {
        if (isObject(d) && typeof d.src === 'string' && /^(https?:|data:image\/|opfs:)/i.test(d.src)) {
            result.dawgs[handle] = {
                handle,
                src: d.src,
                file: typeof d.file === 'string' ? d.file : null,
                filter: result.filters[d.filter] ? d.filter : '',
                metadata: isObject(d.metadata) ? d.metadata : {},
            };
        }
    }
    for (const [handle, l] of Object.entries(data.lists)) {
        if (!isObject(l) || !Array.isArray(l.dawgs)) continue;
        result.lists[handle] = { handle, dawgs: [...new Set(l.dawgs)].filter((h) => result.dawgs[h]) };
    }
    result.lists[FAVORITES] ??= { handle: FAVORITES, dawgs: [] };
    removeOrphansFrom(result);
    return result;
}

function removeOrphansFrom(data) {
    const used = new Set(Object.values(data.lists).flatMap((l) => l.dawgs));
    for (const handle of Object.keys(data.dawgs)) if (!used.has(handle)) delete data.dawgs[handle];
}

/** Replace all data (after normalizeData). */
export function replaceAll(data) {
    state = data;
    commit();
}
