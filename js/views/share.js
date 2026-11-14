/**
 * #/share/<dawg handle>  — the owner's view: preview plus a link to copy.
 * #/share/<payload>      — what a visitor sees when they open a shared link.
 */

import { el, replaceChildren, toast, uid } from '../dom.js';
import * as store from '../store.js';
import { shareUrl, decodeShare } from '../share.js';
import { dawgFigure } from '../components.js';
import * as images from '../images.js';
import { toCss } from '../tones.js';

export function shareView(main, param) {
    const own = store.getDawg(param);
    if (own) {
        replaceChildren(main, el('h1', {}, 'Share this dawg'), el('p', { class: 'muted', role: 'status' }, 'Making your link…'));
        ownerView(main, own);
        return;
    }

    let shared;
    try {
        shared = decodeShare(param);
    } catch (error) {
        replaceChildren(main,
            el('h1', {}, 'Hmm, that link didn’t work'),
            el('p', {}, 'This share link seems to be incomplete or damaged. Ask the sender to copy it again.'),
            el('a', { class: 'btn', href: '#/' }, 'Find other dawgs'),
        );
        return;
    }
    visitorView(main, shared);
}

async function ownerView(main, dawg) {
    const route = location.hash;
    let url;
    try {
        url = await shareUrl(dawg);
    } catch (error) {
        replaceChildren(main, el('h1', {}, 'Couldn’t make a share link'), el('p', {}, error.message));
        return;
    }
    if (location.hash !== route) return; // the viewer moved on while we were reading the image
    const linkId = uid('link');
    const tooLong = url.length > 8000;

    replaceChildren(main, el('section', { class: 'share' },
        el('h1', {}, 'Share this dawg'),
        el('div', { class: 'panel' },
            el('div', { class: 'field' },
                el('label', { for: linkId }, 'Link'),
                el('input', { id: linkId, type: 'text', readonly: true, value: url, onfocus: (e) => e.target.select() }),
                tooLong && el('span', { class: 'hint' }, 'This link is very long because the image was uploaded. Some apps may cut it off; sharing a dawg with an image URL makes a shorter link.'),
            ),
            el('div', { class: 'row' },
                el('button', {
                    type: 'button', class: 'btn',
                    onclick: async () => {
                        try {
                            await navigator.clipboard.writeText(url);
                            toast('Link copied!');
                        } catch {
                            document.getElementById(linkId).select();
                            toast('Press Ctrl+C (or ⌘C) to copy the selected link.');
                        }
                    },
                }, '📋 Copy link'),
                navigator.share && el('button', {
                    type: 'button', class: 'btn btn-secondary',
                    onclick: () => navigator.share({ title: 'A dawg for you', url }).catch(() => {}),
                }, 'Share…'),
                el('a', { class: 'btn btn-secondary', href: url, target: '_blank', rel: 'noopener' }, 'Open as a visitor'),
            ),
        ),
        dawgFigure({ src: dawg.src, file: dawg.file, metadata: dawg.metadata, css: store.filterCss(dawg), headingLevel: 'h2', big: true }),
    ));
}

function visitorView(main, shared) {
    const alreadySaved = !!store.findDawgBySrc(shared.src);

    replaceChildren(main, el('section', { class: 'share' },
        el('h1', {}, 'Someone shared a dawg with you! 🐶'),
        dawgFigure({ src: shared.src, metadata: shared.metadata, css: sharedFilterCss(shared), headingLevel: 'h2', big: true }),
        el('div', { class: 'row', style: { marginTop: '1rem' } },
            el('button', {
                type: 'button', class: 'btn', disabled: alreadySaved,
                onclick: async (e) => {
                    const button = e.currentTarget;
                    button.disabled = true;
                    try {
                        await saveShared(shared);
                        button.textContent = '♥ Saved to Favorites';
                        toast('Saved to your Favorites.');
                    } catch (error) {
                        button.disabled = false;
                        toast(`Couldn’t save: ${error.message}`);
                    }
                },
            }, alreadySaved ? '♥ Already in your dawgs' : '♡ Save to my Favorites'),
            el('a', { class: 'btn btn-secondary', href: '#/' }, 'Find more dawgs'),
        ),
    ));
}

/** The CSS for a shared dawg's filter ('' if it has none, or the link's filter code isn't valid). */
function sharedFilterCss({ filter }) {
    return filter && store.isValidFilterCode(filter.code) ? toCss(filter.code) : '';
}

/** Add a shared dawg (and its filter, if new to this browser) to Favorites. */
async function saveShared({ src, metadata, filter }) {
    let filterHandle = '';
    if (filter && store.isValidFilterCode(filter.code)) {
        filterHandle = store.findFilterByCode(filter.code)?.handle
            ?? store.createFilter({ code: filter.code, metadata: Object.keys(filter.metadata).length ? filter.metadata : { en: { title: 'Shared filter' } } });
    }
    // Store the image in OPFS: decode an embedded upload, or download a web image.
    let handle;
    if (src.startsWith('data:')) {
        const file = await images.saveDataUrl(src);
        handle = store.createDawg({ src: `${images.OPFS_PREFIX}${file}`, file, metadata });
    } else {
        handle = await store.ensureDawg(src, metadata);
    }
    if (filterHandle) store.updateDawg(handle, { filter: filterHandle });
    store.addToList(store.FAVORITES, handle);
}
