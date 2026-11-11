/**
 * Home: search the Dog API by breed, favorite results, add them to lists,
 * or add a dawg from any image URL / upload.
 */

import { el, replaceChildren, rerender, toast, uid } from '../dom.js';
import * as dogApi from '../dogApi.js';
import * as store from '../store.js';
import { dawgFigure, addToListSelect, openDawgEditor } from '../components.js';

// Remember the last search so coming back to Home doesn't lose it.
let lastResults = null;
let lastQuery = '';

export function homeView(main) {
    const inputId = uid('breed');
    const datalistId = uid('breeds');
    const datalist = el('datalist', { id: datalistId });
    const input = el('input', {
        id: inputId, type: 'search', list: datalistId, value: lastQuery,
        placeholder: 'e.g. Golden Retriever', autocomplete: 'off',
    });
    const status = el('p', { class: 'muted', role: 'status' });
    const grid = el('ul', { class: 'grid', 'aria-label': 'Search results' });

    let breeds = [];
    dogApi.listBreeds()
        .then((list) => {
            breeds = list;
            replaceChildren(datalist, list.map((b) => el('option', { value: b.label })));
        })
        .catch(() => { status.textContent = 'Couldn’t load the breed list. You can still search for random dawgs.'; });

    async function search(query) {
        lastQuery = query;
        const q = query.trim().toLowerCase();
        let breed = null;
        if (q) {
            if (!breeds.length) breeds = await dogApi.listBreeds().catch(() => []);
            breed = breeds.find((b) => b.label.toLowerCase() === q)
                ?? breeds.find((b) => b.label.toLowerCase().includes(q));
            if (!breed) {
                status.textContent = `No breed matches “${query}”. Try picking one from the suggestions.`;
                return;
            }
        }
        status.textContent = `Fetching ${breed ? breed.label : 'random'} dawgs…`;
        grid.setAttribute('aria-busy', 'true');
        try {
            const urls = await dogApi.randomImages(breed?.path);
            lastResults = { label: breed?.label ?? 'Random', urls: [...new Set(urls)] };
            renderResults();
        } catch (error) {
            status.textContent = `Something went wrong: ${error.message}`;
        } finally {
            grid.removeAttribute('aria-busy');
        }
    }

    function renderResults() {
        if (!lastResults) return;
        status.textContent = `Showing ${lastResults.urls.length} ${lastResults.label} dawgs.`;
        rerender(grid, () => replaceChildren(grid, lastResults.urls.map(resultCard)));
    }

    const form = el('form', {
        class: 'panel', role: 'search',
        onsubmit: (e) => { e.preventDefault(); search(input.value); },
    },
        el('div', { class: 'row' },
            el('div', { class: 'grow field' }, el('label', { for: inputId }, 'Search by breed'), input),
            el('div', { class: 'field' }, el('button', { class: 'btn', type: 'submit' }, '🔎 Search')),
            el('div', { class: 'field' }, el('button', {
                class: 'btn btn-secondary', type: 'button',
                onclick: () => { input.value = ''; search(''); },
            }, '🎲 Random')),
        ),
        datalist,
    );

    replaceChildren(main,
        el('div', { class: 'page-header' },
            el('h1', {}, 'Find dawgs'),
            el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => openDawgEditor() }, '+ Add from URL or upload'),
        ),
        form,
        status,
        grid,
    );

    if (lastResults) renderResults(); else search('');

    // Favorite buttons and list menus reflect the store, so refresh on changes.
    return store.subscribe(renderResults);
}

/** A search result. It becomes a stored dawg once it's favorited or added to a list. */
function resultCard(src) {
    const existing = store.findDawgBySrc(src);
    const metadata = existing?.metadata ?? dogApi.defaultMetadata(src);
    const title = metadata[Object.keys(metadata)[0]]?.title ?? 'dawg';
    const favorite = store.isFavorite(src);

    return el('li', { class: 'card' },
        dawgFigure({ src, file: existing?.file, metadata, css: store.filterCss(existing) }),
        el('div', { class: 'actions' },
            el('button', {
                type: 'button', class: 'btn btn-small', 'aria-pressed': String(favorite),
                dataset: { key: `fav-${src}` },
                onclick: async (e) => {
                    if (favorite) {
                        store.removeFromList(store.FAVORITES, existing.handle);
                        toast('Removed from Favorites.');
                        return;
                    }
                    e.currentTarget.disabled = true; // while the image downloads into OPFS
                    store.addToList(store.FAVORITES, await store.ensureDawg(src, metadata));
                    toast('Added to Favorites.');
                },
            }, favorite ? '♥ Favorited' : '♡ Favorite', el('span', { class: 'visually-hidden' }, ` ${title}`)),
            addToListSelect({
                key: `add-${src}`,
                labelFor: title,
                exclude: [store.FAVORITES],
                onPick: async (list) => {
                    store.addToList(list, await store.ensureDawg(src, metadata));
                    toast(`Added to ${list}.`);
                },
            }),
        ),
    );
}
