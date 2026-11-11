/**
 * Filters: create, edit, and delete filters. A filter's code is a CSS
 * `filter` value, so anyone who knows (or wants to learn) a bit of CSS can
 * write their own: https://developer.mozilla.org/en-US/docs/Web/CSS/filter
 */

import { el, replaceChildren, rerender, toast, uid } from '../dom.js';
import * as store from '../store.js';
import { metadataEditor, confirmAction, filterTitle, dawgImg } from '../components.js';
import { pickLanguage } from '../i18n.js';
import { toCss, firstStops, hasTones, setTones, MAX_STOPS } from '../tones.js';

const FALLBACK_SAMPLE = 'https://images.dog.ceo/breeds/retriever-golden/n02099601_3004.jpg';

const FILTER_FIELDS = [
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description', multiline: true, hint: 'What does this filter do to an image?' },
    { name: 'instructions', label: 'Instructions', multiline: true, hint: 'Any tips for using it.' },
];

/** Preview on the most recent favorite, if there is one. */
function sampleDawg() {
    return store.getDawg(store.getList(store.FAVORITES).dawgs[0]) ?? { src: FALLBACK_SAMPLE };
}

export function filtersView(main) {
    const editorRegion = el('div');
    const listRegion = el('div');
    let editing = null; // handle being edited, or null for "new"

    replaceChildren(main,
        el('div', { class: 'page-header' }, el('h1', {}, 'Filters')),
        el('p', { class: 'muted' },
            'Filters change how a dawg looks. Each one is a ',
            el('a', { href: 'https://developer.mozilla.org/en-US/docs/Web/CSS/filter' }, 'CSS filter'),
            ' such as ', el('code', {}, 'sepia(1) hue-rotate(90deg)'), ', plus Dawgstagram’s own ',
            el('code', {}, 'tones()'), ' for duotone and multi-tone effects.',
        ),
        editorRegion,
        el('h2', {}, 'Your filters'),
        listRegion,
    );

    function showEditor(handle = null) {
        editing = handle;
        replaceChildren(editorRegion, filterEditor(handle, () => showEditor(null)));
        if (handle) editorRegion.querySelector('details').open = true;
        if (handle) editorRegion.querySelector('textarea')?.focus();
    }

    function renderList() {
        rerender(listRegion, () => replaceChildren(listRegion,
            el('ul', { class: 'grid' }, store.allFilters().map((f) => filterCard(f, () => showEditor(f.handle)))),
        ));
    }

    showEditor(null);
    renderList();
    return store.subscribe(() => {
        if (editing && !store.getFilter(editing)) showEditor(null);
        renderList();
    });
}

function filterEditor(handle, onDone) {
    const filter = handle ? store.getFilter(handle) : { code: '', metadata: {} };
    const codeId = uid('code');
    const error = el('p', { class: 'hint', role: 'alert', style: { color: 'var(--danger)' } });
    const sample = sampleDawg();
    const after = dawgImg(sample, { alt: 'Sample dawg with this filter' });

    const code = el('textarea', {
        id: codeId, class: 'code', value: filter.code, required: true, spellcheck: 'false',
        placeholder: 'grayscale(1) contrast(1.4)',
        oninput: () => {
            const ok = store.isValidFilterCode(code.value);
            error.textContent = ok ? '' : 'Your browser doesn’t understand that filter yet.';
            if (ok) after.style.filter = toCss(code.value);
        },
    });
    after.style.filter = toCss(filter.code);

    /** Put builder colors into the code box, and update the preview. */
    const applyTones = (stops) => {
        code.value = setTones(code.value, stops);
        code.dispatchEvent(new Event('input'));
    };

    const meta = metadataEditor(FILTER_FIELDS, filter.metadata);

    const form = el('form', {
        onsubmit: (e) => {
            e.preventDefault();
            const value = code.value.trim();
            if (!value || !store.isValidFilterCode(value)) {
                code.setCustomValidity('Enter a valid CSS filter, like sepia(1).');
                code.reportValidity();
                code.setCustomValidity('');
                return;
            }
            const metadata = meta.read();
            if (!metadata || !form.reportValidity()) return;
            if (handle) {
                store.updateFilter(handle, { code: value, metadata });
                toast('Filter saved.');
            } else {
                store.createFilter({ code: value, metadata });
                toast('Filter created.');
            }
            onDone();
        },
    },
        el('div', { class: 'filter-editor' },
            el('div', {},
                el('div', { class: 'field' },
                    el('label', { for: codeId }, 'Filter code (CSS)'),
                    code,
                    el('span', { class: 'hint' }, 'Combine functions like blur(), brightness(), contrast(), grayscale(), hue-rotate(), invert(), opacity(), saturate(), sepia(), drop-shadow(), and tones(#450084, #8ee4d7).'),
                    error,
                ),
                tonesBuilder(firstStops(filter.code), applyTones, () => hasTones(code.value)),
                meta.node,
            ),
            el('div', { class: 'filter-preview', 'aria-label': 'Preview' },
                el('figure', {}, dawgImg(sample, { alt: 'Sample dawg, unfiltered' }), el('figcaption', {}, 'Before')),
                el('figure', {}, after, el('figcaption', {}, 'After')),
            ),
        ),
        el('div', { class: 'row', style: { marginTop: '1rem' } },
            el('button', { type: 'submit', class: 'btn' }, handle ? 'Save filter' : 'Create filter'),
            handle && el('button', { type: 'button', class: 'btn btn-secondary', onclick: onDone }, 'Cancel'),
        ),
    );

    return el('details', { class: 'panel' },
        el('summary', {}, handle ? `Editing “${filterTitle(filter)}”` : '+ Create a new filter'),
        form,
    );
}

/**
 * Color pickers for tones(): the first color replaces the darkest parts of the
 * image and the last the brightest, with any others in between.
 * Changing a color updates the code box once it has a tones(...) in it.
 */
function tonesBuilder(initial, apply, codeHasTones) {
    let stops = initial ?? ['#450084', '#8ee4d7'];
    const list = el('ol', { class: 'tone-stops' });
    const gradient = el('div', { class: 'tone-gradient', 'aria-hidden': 'true' });
    const addButton = el('button', { type: 'button', class: 'btn btn-secondary btn-small', onclick: () => {
        stops.splice(stops.length - 1, 0, mix(stops[stops.length - 2], stops[stops.length - 1]));
        changed();
        render();
        list.querySelectorAll('input')[stops.length - 2].focus();
    } }, '+ Add a color');

    const changed = () => {
        gradient.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
        addButton.disabled = stops.length >= MAX_STOPS;
        if (codeHasTones()) apply(stops);
    };

    function render() {
        replaceChildren(list, stops.map((color, i) => {
            const id = uid('tone');
            const position = i === 0 ? ' (darkest)' : i === stops.length - 1 ? ' (lightest)' : '';
            return el('li', {},
                el('label', { for: id }, `Color ${i + 1}${position}`),
                el('input', { id, type: 'color', value: color, oninput: (e) => { stops[i] = e.target.value; changed(); } }),
                stops.length > 2 && el('button', {
                    type: 'button', class: 'btn btn-secondary btn-small',
                    onclick: () => {
                        stops.splice(i, 1);
                        changed();
                        render();
                        list.querySelectorAll('input')[Math.min(i, stops.length - 1)].focus();
                    },
                }, 'Remove', el('span', { class: 'visually-hidden' }, ` color ${i + 1}`)),
            );
        }));
    }
    render();
    changed();

    return el('fieldset', { class: 'tones-builder' },
        el('legend', {}, 'Duotone and multi-tone'),
        el('p', { class: 'hint' }, 'Turns the image gray, then recolors it: the first color for the darkest parts, the last for the brightest.'),
        gradient,
        list,
        el('div', { class: 'row' },
            addButton,
            el('button', { type: 'button', class: 'btn btn-small', onclick: () => apply(stops) }, 'Use these colors'),
        ),
    );
}

/** The color halfway between two hex colors. */
function mix(a, b) {
    const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round((channel(a, i) + channel(b, i)) / 2).toString(16).padStart(2, '0')).join('');
}

function filterCard(filter, onEdit) {
    const lang = pickLanguage(filter.metadata);
    const meta = filter.metadata[lang] ?? {};
    const title = meta.title || filter.handle;
    const used = store.allDawgs().filter((d) => d.filter === filter.handle).length;
    const name = el('span', { class: 'visually-hidden' }, ` ${title}`);

    return el('li', { class: 'card' },
        el('figure', {},
            el('div', { class: 'frame' }, dawgImg(sampleDawg(), { alt: '', loading: 'lazy', style: { filter: toCss(filter.code) } })),
            el('figcaption', {},
                el('h3', { lang }, title),
                meta.description && el('p', { lang }, meta.description),
                meta.instructions && el('p', { lang, class: 'muted' }, meta.instructions),
                el('pre', {}, el('code', {}, filter.code)),
                el('p', { class: 'muted' }, used ? `Used by ${used} ${used === 1 ? 'dawg' : 'dawgs'}` : 'Not used yet'),
            ),
        ),
        el('div', { class: 'actions' },
            el('button', { type: 'button', class: 'btn btn-secondary btn-small', dataset: { key: `edit-${filter.handle}` }, onclick: onEdit }, 'Edit', name.cloneNode(true)),
            el('button', {
                type: 'button', class: 'btn btn-danger btn-small', dataset: { key: `del-${filter.handle}` },
                onclick: () => {
                    const extra = used ? ` ${used} ${used === 1 ? 'dawg uses' : 'dawgs use'} it and will go back to no filter.` : '';
                    if (!confirmAction(`Delete the “${title}” filter?${extra}`)) return;
                    store.deleteFilter(filter.handle);
                    toast('Filter deleted.');
                },
            }, 'Delete', name.cloneNode(true)),
        ),
    );
}
