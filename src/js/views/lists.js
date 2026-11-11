/**
 * Favorites and Dawglists: view a list's dawgs, apply filters, edit, share,
 * reorder, and remove. The Dawglists page adds a sidebar to create, rename,
 * and delete lists.
 */

import { el, replaceChildren, rerender, toast, uid } from '../dom.js';
import * as store from '../store.js';
import { dawgFigure, dawgImg, filterSelect, addToListSelect, openDawgEditor, confirmAction } from '../components.js';
import { pickLanguage } from '../i18n.js';

/** #/favorites */
export function favoritesView(main) {
    const region = el('div');
    replaceChildren(main, region);
    const render = () => rerender(region, () => replaceChildren(region, listSection(store.FAVORITES, '#/favorites')));
    render();
    return store.subscribe(render);
}

/** #/lists and #/lists/<handle> */
export function listsView(main, selected) {
    const sidebar = el('nav', { class: 'sidebar', 'aria-label': 'Dawglists' });
    const content = el('div');
    replaceChildren(main, el('div', { class: 'with-sidebar' }, sidebar, content));

    function render() {
        const current = store.getList(selected) ? selected : null;
        rerender(sidebar, () => replaceChildren(sidebar, listSidebar(current)));
        rerender(content, () => replaceChildren(content, current
            ? listSection(current, `#/lists/${encodeURIComponent(current)}`, true)
            : overview()));
    }
    render();
    return store.subscribe(render);
}

function listSidebar(current) {
    const nameId = uid('new-list');
    return [
        el('h2', {}, 'Your lists'),
        el('ul', {},
            el('li', {}, el('a', { href: '#/lists', 'aria-current': current ? null : 'page' }, 'All lists')),
            store.allLists().map((list) => el('li', {},
                el('a', {
                    href: `#/lists/${encodeURIComponent(list.handle)}`,
                    'aria-current': list.handle === current ? 'page' : null,
                },
                    el('span', {}, list.handle === store.FAVORITES ? '♥ Favorites' : list.handle),
                    el('span', { class: 'muted' }, el('span', { class: 'visually-hidden' }, ', '), list.dawgs.length, el('span', { class: 'visually-hidden' }, ' dawgs')),
                ),
            )),
        ),
        el('form', {
            onsubmit: (e) => {
                e.preventDefault();
                const input = e.target.elements.name;
                try {
                    const handle = store.createList(input.value);
                    location.hash = `#/lists/${encodeURIComponent(handle)}`;
                    toast(`Created ${handle}.`);
                } catch (error) {
                    toast(error.message);
                }
            },
        },
            el('div', { class: 'field' },
                el('label', { for: nameId }, 'New list'),
                el('input', { id: nameId, name: 'name', type: 'text', required: true, placeholder: 'e.g. Fluffers', autocomplete: 'off' }),
            ),
            el('button', { type: 'submit', class: 'btn btn-small' }, '+ Create list'),
        ),
    ];
}

function overview() {
    const lists = store.allLists();
    return [
        el('h1', {}, 'Dawglists'),
        el('p', { class: 'muted' }, 'Collect dawgs into lists of your own. Every dawg you favorite lands in Favorites.'),
        el('ul', { class: 'grid' }, lists.map((list) => {
            const cover = store.getDawg(list.dawgs[0]);
            return el('li', { class: 'card' },
                el('a', { href: `#/lists/${encodeURIComponent(list.handle)}`, style: { textDecoration: 'none', color: 'inherit' } },
                    el('figure', {},
                        cover
                            ? el('div', { class: 'frame' }, dawgImg(cover, { alt: '', loading: 'lazy', style: { filter: store.filterCss(cover) } }))
                            : el('div', { class: 'frame placeholder', 'aria-hidden': 'true' }, '🐶'),
                        el('figcaption', { style: { paddingBottom: '0.85rem' } },
                            el('h2', { style: { margin: 0, fontSize: '1.25rem' } }, list.handle),
                            el('p', { class: 'muted' }, `${list.dawgs.length} ${list.dawgs.length === 1 ? 'dawg' : 'dawgs'}`),
                        ),
                    ),
                ),
            );
        })),
    ];
}

/** One list: heading, list actions, and its dawg cards. */
function listSection(listHandle, href, manageable = false) {
    const list = store.getList(listHandle);
    const isFavorites = listHandle === store.FAVORITES;
    const dawgs = list.dawgs.map(store.getDawg).filter(Boolean);

    return [
        el('div', { class: 'page-header' },
            el('h1', {}, isFavorites ? 'Favorites' : list.handle),
            el('div', { class: 'row' },
                el('button', {
                    type: 'button', class: 'btn btn-secondary btn-small',
                    onclick: () => openDawgEditor({ listHandle }),
                }, '+ Add from URL or upload'),
                manageable && !isFavorites && el('button', {
                    type: 'button', class: 'btn btn-secondary btn-small',
                    onclick: () => {
                        const name = window.prompt('Rename list to:', list.handle);
                        if (!name) return;
                        try {
                            const handle = store.renameList(list.handle, name);
                            location.hash = `#/lists/${encodeURIComponent(handle)}`;
                        } catch (error) {
                            toast(error.message);
                        }
                    },
                }, 'Rename'),
                manageable && !isFavorites && el('button', {
                    type: 'button', class: 'btn btn-danger btn-small',
                    onclick: () => {
                        if (!confirmAction(`Delete the list “${list.handle}”? Dawgs that aren’t in any other list will be deleted too.`)) return;
                        store.deleteList(list.handle);
                        location.hash = '#/lists';
                        toast('List deleted.');
                    },
                }, 'Delete list'),
            ),
        ),
        dawgs.length
            ? el('ul', { class: 'grid' }, dawgs.map((dawg, i) => dawgCard(dawg, listHandle, i, dawgs.length)))
            : el('div', { class: 'empty' },
                el('p', {}, 'No dawgs here yet.'),
                el('a', { class: 'btn', href: '#/' }, 'Find some dawgs'),
            ),
    ];
}

function dawgCard(dawg, listHandle, index, count) {
    const lang = pickLanguage(dawg.metadata);
    const title = dawg.metadata[lang]?.title || 'Untitled dawg';
    const name = el('span', { class: 'visually-hidden' }, ` ${title}`);
    const others = store.listsContaining(dawg.handle).map((l) => l.handle);
    const key = (action) => `${action}-${dawg.handle}`;

    return el('li', { class: 'card' },
        dawgFigure({ src: dawg.src, file: dawg.file, metadata: dawg.metadata, css: store.filterCss(dawg) }),
        el('div', { class: 'actions' },
            filterSelect({
                value: dawg.filter,
                key: key('filter'),
                label: `Filter for ${title}`,
                onChange: (filter) => store.updateDawg(dawg.handle, { filter }),
            }),
            addToListSelect({
                key: key('add'),
                labelFor: title,
                exclude: others,
                onPick: (target) => { store.addToList(target, dawg.handle); toast(`Added to ${target}.`); },
            }),
        ),
        el('div', { class: 'actions', style: { paddingTop: 0 } },
            el('a', { class: 'btn btn-small', href: `#/share/${dawg.handle}`, dataset: { key: key('share') } }, 'Share', name.cloneNode(true)),
            el('button', {
                type: 'button', class: 'btn btn-secondary btn-small', dataset: { key: key('edit') },
                onclick: () => openDawgEditor({ handle: dawg.handle }),
            }, 'Edit', name.cloneNode(true)),
            el('button', {
                type: 'button', class: 'btn btn-secondary btn-small', disabled: index === 0,
                dataset: { key: key('up') }, onclick: () => store.moveInList(listHandle, dawg.handle, -1),
            }, el('span', { 'aria-hidden': 'true' }, '←'), el('span', { class: 'visually-hidden' }, `Move ${title} earlier`)),
            el('button', {
                type: 'button', class: 'btn btn-secondary btn-small', disabled: index === count - 1,
                dataset: { key: key('down') }, onclick: () => store.moveInList(listHandle, dawg.handle, 1),
            }, el('span', { 'aria-hidden': 'true' }, '→'), el('span', { class: 'visually-hidden' }, `Move ${title} later`)),
            el('button', {
                type: 'button', class: 'btn btn-danger btn-small', dataset: { key: key('remove') },
                onclick: () => {
                    const lastHome = others.length === 1;
                    if (lastHome && !confirmAction(`“${title}” isn’t in any other list, so removing it deletes it. Continue?`)) return;
                    store.removeFromList(listHandle, dawg.handle);
                    toast(`Removed from ${listHandle}.`);
                },
            }, 'Remove', name.cloneNode(true)),
        ),
    );
}
