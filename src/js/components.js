/**
 * Reusable UI pieces: dawg figures/cards, menus, the metadata editor, and the dawg editor dialog.
 */

import { el, replaceChildren, toast, uid } from './dom.js';
import { pickLanguage, languageName, isLanguageTag } from './i18n.js';
import * as store from './store.js';
import * as images from './images.js';

/* ---------- images ---------- */

/**
 * Point an <img> at a dawg's image: the OPFS copy when there is one,
 * otherwise (or if reading it fails) the original web URL.
 */
export function showImage(img, { src, file }) {
    const webSrc = src && !src.startsWith(images.OPFS_PREFIX) ? src : null;
    const showWeb = () => {
        // Load images from hosts known to allow it in CORS mode. The browser
        // can then reuse its cached copy when the image is saved to OPFS,
        // instead of downloading it again.
        if (images.allowsCors(webSrc)) img.crossOrigin = 'anonymous';
        img.src = webSrc;
    };
    if (!file) {
        if (webSrc) showWeb();
        return img;
    }
    images.objectUrl(file)
        .then((url) => { img.src = url; })
        .catch(() => {
            if (webSrc) showWeb();
            else img.dispatchEvent(new Event('error'));
        });
    return img;
}

/** An <img> for a dawg (or anything with `src` and optional `file`). */
export function dawgImg(dawg, props = {}) {
    return showImage(el('img', { decoding: 'async', ...props }), dawg ?? {});
}

/* ---------- Dawg figure (image + localized caption) ---------- */

/**
 * An image with its title/body in the viewer's best language, a language
 * picker when there is more than one.
 */
export function dawgFigure({ src, file = null, css = '', metadata = {}, headingLevel = 'h3', big = false }) {
    const languages = Object.keys(metadata);
    let lang = pickLanguage(metadata);

    const img = dawgImg({ src, file }, { loading: big ? 'eager' : 'lazy', style: { filter: css } });
    img.addEventListener('error', () => { img.alt = 'This image could not be loaded.'; }, { once: true });
    const caption = el('figcaption');

    function render() {
        const entry = metadata[lang] ?? {};
        const title = String(entry.title ?? '').trim() || 'Untitled dawg';
        const body = String(entry.body ?? '').trim();
        img.alt = body || title;
        img.lang = lang ?? '';

        const langId = uid('lang');
        replaceChildren(caption,
            el(headingLevel, { lang }, title),
            body && el('p', { lang }, body),
            el('div', { class: 'meta-row' },
                languages.length > 1 && el('span', {},
                    el('label', { for: langId, class: 'visually-hidden' }, 'Caption language'),
                    el('select', {
                        id: langId, class: 'btn-small', value: lang,
                        dataset: { key: `lang-${src}` },
                        onchange: (e) => { lang = e.target.value; render(); caption.querySelector('select')?.focus(); },
                    }, languages.map((l) => el('option', { value: l }, languageName(l)))),
                ),
            ),
        );
    }
    render();

    return el('figure', {}, el('div', { class: 'frame' }, img), caption);
}

/* ---------- menus ---------- */

/** A <select> of filters. Calls onChange(filterHandle) ('' = none). */
export function filterSelect({ value = '', onChange, label = 'Filter', key, small = true }) {
    const id = uid('filter');
    return [
        el('label', { for: id, class: 'visually-hidden' }, label),
        el('select', { id, value, class: small ? 'btn-small' : '', dataset: key ? { key } : null, onchange: (e) => onChange(e.target.value) },
            el('option', { value: '' }, 'No filter'),
            store.allFilters().map((f) => el('option', { value: f.handle }, filterTitle(f))),
        ),
    ];
}

export const filterTitle = (filter) => {
    const meta = filter.metadata?.[pickLanguage(filter.metadata)];
    return meta?.title || filter.handle;
};

/** A one-shot "Add to list…" <select>. Calls onPick(listHandle). */
export function addToListSelect({ exclude = [], onPick, key, labelFor = 'this dawg' }) {
    const id = uid('add');
    const lists = store.allLists().filter((l) => !exclude.includes(l.handle));
    return [
        el('label', { for: id, class: 'visually-hidden' }, `Add ${labelFor} to a list`),
        el('select', {
            id, dataset: key ? { key } : null,
            onchange: (e) => {
                const value = e.target.value;
                e.target.value = '';
                if (value === '__new__') {
                    const name = window.prompt?.('Name for the new list:');
                    if (!name) return;
                    try { onPick(store.createList(name)); } catch (error) { toast(error.message); }
                } else if (value) {
                    onPick(value);
                }
            },
        },
            el('option', { value: '' }, 'Add to list…'),
            lists.map((l) => el('option', { value: l.handle }, l.handle)),
            el('option', { value: '__new__' }, '+ New list…'),
        ),
    ];
}

/* ---------- metadata editor ---------- */

/**
 * Edit `{ [lang]: { ...fields } }`, one fieldset per language.
 * @param {Array<{name: string, label: string, multiline?: boolean, required?: boolean, hint?: string}>} fields
 * @returns {{ node: HTMLElement, read: () => object|null }} read() returns null and reports problems if invalid.
 */
export function metadataEditor(fields, metadata = {}, { onInput } = {}) {
    const rows = el('div');
    const entries = Object.keys(metadata).length ? Object.entries(metadata) : [[navigator.language?.split('-')[0] || 'en', {}]];

    function addRow(lang = '', values = {}) {
        const langId = uid('lang');
        const legend = el('legend');
        const langInput = el('input', {
            id: langId, type: 'text', value: lang, required: true, placeholder: 'en', autocomplete: 'off',
            spellcheck: 'false', size: 8,
            oninput: () => { updateLegend(); onInput?.(); },
        });
        const updateLegend = () => {
            const tag = langInput.value.trim();
            legend.textContent = isLanguageTag(tag) ? `${languageName(tag)} (${tag})` : 'New language';
        };
        updateLegend();

        const row = el('fieldset', { class: 'lang-row' },
            legend,
            el('div', { class: 'field' },
                el('label', { for: langId }, 'Language code'),
                langInput,
                el('span', { class: 'hint' }, 'A BCP 47 tag, like en, es, or pt-BR.'),
            ),
            fields.map((f) => {
                const id = uid(f.name);
                const props = { id, name: f.name, value: values[f.name] ?? '', required: !!f.required, oninput: () => onInput?.() };
                return el('div', { class: 'field' },
                    el('label', { for: id }, f.label),
                    f.multiline ? el('textarea', props) : el('input', { type: 'text', ...props }),
                    f.hint && el('span', { class: 'hint' }, f.hint),
                );
            }),
            el('button', {
                type: 'button', class: 'btn btn-danger btn-small',
                onclick: () => {
                    if (rows.children.length === 1) return toast('Keep at least one language.');
                    row.remove();
                    rows.querySelector('input')?.focus();
                    onInput?.();
                },
            }, 'Remove this language'),
        );
        row.langInput = langInput;
        rows.append(row);
        return row;
    }

    entries.forEach(([lang, values]) => addRow(lang, values));

    const node = el('div', {},
        rows,
        el('button', {
            type: 'button', class: 'btn btn-secondary btn-small',
            onclick: () => addRow().langInput.focus(),
        }, '+ Add another language'),
    );

    function read() {
        const result = {};
        for (const row of rows.children) {
            const tag = row.langInput.value.trim();
            if (!isLanguageTag(tag)) {
                row.langInput.setCustomValidity('Enter a language code like en or es.');
                row.langInput.reportValidity();
                row.langInput.setCustomValidity('');
                return null;
            }
            const canonical = Intl.getCanonicalLocales(tag)[0];
            if (result[canonical]) {
                row.langInput.setCustomValidity(`${canonical} is listed twice.`);
                row.langInput.reportValidity();
                row.langInput.setCustomValidity('');
                return null;
            }
            result[canonical] = Object.fromEntries(fields.map((f) => [f.name, row.querySelector(`[name="${f.name}"]`).value.trim()]));
        }
        return result;
    }

    return { node, read };
}

export const DAWG_FIELDS = [
    { name: 'title', label: 'Title', required: true },
    { name: 'body', label: 'Description', multiline: true, hint: 'Describe the image. This is what screen readers say.' },
];

/* ---------- image upload ---------- */

/** Read an image file as a JPEG blob, scaled down to at most `maxSize` pixels on a side. */
export function resizeImage(file, maxSize = 1600) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.naturalWidth * scale);
            canvas.height = Math.round(img.naturalHeight * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Couldn’t process that image.'))), 'image/jpeg', 0.85);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t an image the browser can read.')); };
        img.src = url;
    });
}

class InvalidSrc extends Error {}

const isImageSrc = (src) => /^(https?:\/\/\S+|data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=]+)$/i.test(src);

/* ---------- dawg editor dialog ---------- */

/**
 * Create or edit a dawg in a modal dialog.
 * @param {object} options
 * @param {string} [options.handle] existing dawg to edit; omit to create
 * @param {string} [options.listHandle] list to add a new dawg to (default Favorites)
 * @param {object} [options.initial] starting values for a new dawg
 */
export function openDawgEditor({ handle, listHandle = store.FAVORITES, initial = {} } = {}) {
    const existing = handle ? store.getDawg(handle) : null;
    const dawg = existing ?? { src: '', filter: '', metadata: {}, ...initial };
    const titleId = uid('dialog-title');

    // Where the image comes from. An uploaded (or previously uploaded) image has
    // no URL to show in the text box.
    const wasUpload = dawg.src.startsWith(images.OPFS_PREFIX);
    let keepExisting = !!existing; // unchanged image on an existing dawg
    let upload = null; // a new Blob chosen with the file picker
    let uploadUrl = null; // blob: URL to preview it

    const preview = dawgImg(dawg.src ? dawg : null, { class: 'dialog-preview', alt: 'Preview' });
    const setFilterPreview = () => { preview.style.filter = store.getFilter(filterValue)?.code ?? ''; };

    const srcId = uid('src');
    const uploadNote = el('span', { class: 'hint' }, wasUpload ? 'Using an uploaded image, stored in this browser.' : '');
    const srcInput = el('input', {
        id: srcId, type: 'text', inputmode: 'url', value: wasUpload ? '' : dawg.src,
        placeholder: 'https://images.dog.ceo/…', autocomplete: 'off', spellcheck: 'false',
        oninput: () => {
            keepExisting = false;
            upload = null;
            uploadNote.textContent = '';
            const src = srcInput.value.trim();
            if (src) preview.src = src; else preview.removeAttribute('src');
        },
    });
    const fileId = uid('file');
    const fileInput = el('input', {
        id: fileId, type: 'file', accept: 'image/*',
        onchange: async () => {
            const file = fileInput.files[0];
            if (!file) return;
            try {
                upload = await resizeImage(file);
                keepExisting = false;
                if (uploadUrl) URL.revokeObjectURL(uploadUrl);
                uploadUrl = URL.createObjectURL(upload);
                preview.src = uploadUrl;
                srcInput.value = '';
                uploadNote.textContent = `Using ${file.name}. It will be stored in this browser.`;
            } catch (error) {
                toast(error.message);
            }
        },
    });

    /** Save the chosen image to OPFS if needed. Returns { src, file }, or null if no image was chosen. */
    async function resolveImage() {
        if (upload) {
            const file = await images.saveBlob(upload);
            return { src: `${images.OPFS_PREFIX}${file}`, file };
        }
        const typed = srcInput.value.trim();
        if (keepExisting && (typed === dawg.src || (wasUpload && !typed))) return { src: dawg.src, file: dawg.file };
        if (!typed) return null;
        if (!isImageSrc(typed)) throw new InvalidSrc();
        if (typed.startsWith('data:')) {
            const file = await images.saveDataUrl(typed);
            return { src: `${images.OPFS_PREFIX}${file}`, file };
        }
        return { src: typed, file: await images.saveFromUrl(typed) };
    }

    let filterValue = dawg.filter;
    const meta = metadataEditor(DAWG_FIELDS, dawg.metadata);
    const submitLabel = existing ? 'Save' : 'Add dawg';
    const submit = el('button', { type: 'submit', class: 'btn' }, submitLabel);

    const form = el('form', { method: 'dialog' },
        el('h2', { id: titleId }, existing ? 'Edit dawg' : 'New dawg'),
        el('div', { class: 'row' },
            preview,
            el('div', { class: 'grow' },
                el('div', { class: 'field' },
                    el('label', { for: srcId }, 'Image URL'),
                    srcInput,
                    uploadNote,
                ),
                el('div', { class: 'field' },
                    el('label', { for: fileId }, '…or upload an image'),
                    fileInput,
                ),
                el('div', { class: 'field' },
                    filterSelect({ value: filterValue, small: false, onChange: (v) => { filterValue = v; setFilterPreview(); } }),
                ),
            ),
        ),
        el('h3', {}, 'Descriptions'),
        el('p', { class: 'muted' }, 'Add a title and description in as many languages as you like. Viewers see the one closest to their own language.'),
        meta.node,
        el('footer', {},
            existing && el('button', {
                type: 'button', class: 'btn btn-danger',
                onclick: () => {
                    if (!confirmAction('Delete this dawg from every list?')) return;
                    store.deleteDawg(handle);
                    toast('Dawg deleted.');
                    dialog.close();
                },
            }, 'Delete dawg'),
            el('span', { class: 'spacer' }),
            el('button', { type: 'button', class: 'btn btn-secondary', onclick: () => dialog.close() }, 'Cancel'),
            submit,
        ),
    );
    // The filter <select> label is visually hidden in cards; show it here.
    form.querySelector('label[for^="filter"]').classList.remove('visually-hidden');

    const badSrc = () => {
        srcInput.setCustomValidity('Enter an http(s) image URL, or upload an image.');
        srcInput.reportValidity();
        srcInput.setCustomValidity('');
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const metadata = meta.read();
        if (!metadata || !form.reportValidity()) return;

        submit.disabled = true;
        submit.textContent = 'Saving…';
        try {
            const image = await resolveImage();
            if (!image) return badSrc();
            if (existing) {
                store.updateDawg(handle, { ...image, filter: filterValue, metadata });
                toast('Dawg saved.');
            } else {
                const newHandle = store.createDawg({ ...image, filter: filterValue, metadata });
                store.addToList(listHandle, newHandle);
                toast(`Added to ${listHandle}.`);
            }
            dialog.close();
        } catch (error) {
            if (error instanceof InvalidSrc) badSrc();
            else toast(`Couldn’t save: ${error.message}`);
        } finally {
            submit.disabled = false;
            submit.textContent = submitLabel;
        }
    });

    const dialog = el('dialog', { 'aria-labelledby': titleId }, form);
    dialog.addEventListener('close', () => {
        if (uploadUrl) URL.revokeObjectURL(uploadUrl);
        dialog.remove();
    });
    document.body.append(dialog);
    setFilterPreview();
    dialog.showModal();
}

/** Ask before destructive actions. (A native confirm keeps this small and accessible.) */
export function confirmAction(message) {
    return window.confirm(message);
}
