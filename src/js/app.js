/**
 * Entry point: a tiny hash router. Hash URLs (#/favorites) work on any static
 * host with no server configuration.
 *
 * Each view is a function (main, ...params) that renders into <main> and may
 * return a cleanup function (e.g. to unsubscribe from the store).
 */

import { homeView } from './views/home.js';
import { favoritesView, listsView } from './views/lists.js';
import { filtersView } from './views/filters.js';
import { shareView } from './views/share.js';
import { backupView } from './views/backup.js';
import { el, replaceChildren } from './dom.js';
import { storeMissingImages } from './store.js';

const routes = [
    { pattern: /^\/?$/, nav: 'home', title: 'Find dawgs', view: homeView },
    { pattern: /^\/favorites$/, nav: 'favorites', title: 'Favorites', view: favoritesView },
    { pattern: /^\/lists(?:\/(.+))?$/, nav: 'lists', title: 'Dawglists', view: listsView },
    { pattern: /^\/filters$/, nav: 'filters', title: 'Filters', view: filtersView },
    { pattern: /^\/share\/(.+)$/, nav: null, title: 'Shared dawg', view: shareView },
    { pattern: /^\/backup$/, nav: 'backup', title: 'Back up & restore', view: backupView },
];

const main = document.getElementById('main');
let cleanup = null;
let firstRender = true;

function route() {
    const path = location.hash.replace(/^#/, '');
    const match = routes.map((r) => ({ r, m: r.pattern.exec(path) })).find((x) => x.m);

    cleanup?.();
    cleanup = null;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());

    if (!match) {
        replaceChildren(main,
            el('h1', {}, 'No dawgs here'),
            el('p', {}, 'That page doesn’t exist.'),
            el('a', { class: 'btn', href: '#/' }, 'Go home'),
        );
        setNav(null, 'Not found');
    } else {
        const params = match.m.slice(1).map((p) => (p === undefined ? undefined : safeDecode(p)));
        cleanup = match.r.view(main, ...params) ?? null;
        const heading = main.querySelector('h1')?.textContent;
        setNav(match.r.nav, heading || match.r.title);
    }

    // Move focus to the new content so keyboard and screen-reader users
    // know the page changed (but not on first load).
    if (!firstRender) {
        main.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    }
    firstRender = false;
}

function safeDecode(text) {
    try { return decodeURIComponent(text); } catch { return text; }
}

function setNav(active, title) {
    document.title = `${title} · Dawgstagram`;
    document.querySelectorAll('[data-nav]').forEach((a) => {
        if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
    });
}

window.addEventListener('hashchange', route);
route();

// In the background: move any images not yet in OPFS there, and tidy up unused ones.
storeMissingImages();
