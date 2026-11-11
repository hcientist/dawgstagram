// Data layer (store.js) and share links (share.js), tested in the browser.
import { test, expect, openBlankPage, mockDogApi } from './helpers.js';

test.beforeEach(async ({ page }) => {
    await mockDogApi(page);
    await openBlankPage(page);
});

test('starts with Favorites and the built-in filters', async ({ page }) => {
    const result = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        return { lists: store.allLists().map((l) => l.handle), filters: store.allFilters().length };
    });
    expect(result.lists).toEqual(['Favorites']);
    expect(result.filters).toBe(7);
});

test('dawg and list CRUD, including orphan cleanup', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const url = 'https://images.dog.ceo/breeds/hound-afghan/a.jpg';
        const h = await store.ensureDawg(url, { en: { title: 'Afghan Hound', body: 'x' } });
        store.addToList(store.FAVORITES, h);
        const favorited = store.isFavorite(url);

        store.createList('Fluffers');
        store.addToList('Fluffers', h);
        store.removeFromList(store.FAVORITES, h);
        const survivesInOtherList = !!store.getDawg(h);

        store.renameList('Fluffers', 'Floofs');
        const renamedKeepsDawgs = store.getList('Floofs').dawgs.includes(h);

        store.deleteList('Floofs');
        const orphanRemoved = !store.getDawg(h);

        const errors = [];
        for (const action of [
            () => store.deleteList(store.FAVORITES),
            () => store.renameList(store.FAVORITES, 'Nope'),
            () => store.createList('Favorites'),
            () => store.createList('   '),
        ]) {
            try { action(); errors.push(null); } catch (e) { errors.push(e.message); }
        }
        return { favorited, survivesInOtherList, renamedKeepsDawgs, orphanRemoved, errors };
    });
    expect(r.favorited).toBe(true);
    expect(r.survivesInOtherList).toBe(true);
    expect(r.renamedKeepsDawgs).toBe(true);
    expect(r.orphanRemoved).toBe(true);
    expect(r.errors.every(Boolean)).toBe(true);
});

test('handles are unique and readable', async ({ page }) => {
    const handles = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const make = (title) => store.createDawg({ src: `https://example.com/${Math.random()}.jpg`, metadata: { en: { title } } });
        return [make('Señor Pug!'), make('Señor Pug!'), make('')];
    });
    expect(handles).toEqual(['senor-pug', 'senor-pug-2', 'dawg']);
});

test('reordering a list', async ({ page }) => {
    const order = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const [a, b, c] = ['a', 'b', 'c'].map((t) => store.createDawg({ src: `https://example.com/${t}.jpg`, metadata: { en: { title: t } } }));
        [a, b, c].forEach((h) => store.addToList(store.FAVORITES, h)); // newest first: c, b, a
        store.moveInList(store.FAVORITES, a, -1);
        store.moveInList(store.FAVORITES, c, -1); // already first: no-op
        return store.getList(store.FAVORITES).dawgs;
    });
    expect(order).toEqual(['c', 'a', 'b']);
});

test('filters: validation and deleting clears dawgs that used it', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const f = store.createFilter({ code: 'hue-rotate(45deg)', metadata: { en: { title: 'Tilt' } } });
        const d = store.createDawg({ src: 'https://example.com/x.jpg', filter: f, metadata: {} });
        store.addToList(store.FAVORITES, d);
        const cssBefore = store.filterCss(store.getDawg(d));
        store.deleteFilter(f);
        return {
            cssBefore,
            filterAfter: store.getDawg(d).filter,
            valid: ['sepia(1)', 'blur(2px) contrast(1.2)', ''].map(store.isValidFilterCode),
            invalid: ['url(https://evil.example/x.svg#f)', 'banana(3)', 'sepia(1); color: red'].map(store.isValidFilterCode),
        };
    });
    expect(r.cssBefore).toBe('hue-rotate(45deg)');
    expect(r.filterAfter).toBe('');
    expect(r.valid).toEqual([true, true, true]);
    expect(r.invalid).toEqual([false, false, false]);
});

test('data survives a reload', async ({ page }) => {
    await page.evaluate(async () => {
        const store = await import('/js/store.js');
        store.createList('Keepers');
    });
    await page.reload();
    const lists = await page.evaluate(async () => (await import('/js/store.js')).allLists().map((l) => l.handle));
    expect(lists).toContain('Keepers');
});

test('share links round-trip and reject unsafe images', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const share = await import('/js/share.js');
        const h = store.createDawg({
            src: 'https://images.dog.ceo/breeds/pug/a.jpg',
            filter: 'sepia',
            metadata: { en: { title: 'Pug' }, es: { title: 'Carlino ñ', body: '¡Hola!' } },
        });
        const decoded = share.decodeShare((await share.shareUrl(store.getDawg(h))).split('#/share/')[1]);
        const rejects = [];
        for (const payload of [{ src: 'javascript:alert(1)' }, { src: 'data:text/html,<script>' }, 'not json']) {
            const encoded = btoa(typeof payload === 'string' ? payload : JSON.stringify(payload));
            try { share.decodeShare(encoded); rejects.push(false); } catch { rejects.push(true); }
        }
        return { decoded, rejects };
    });
    expect(r.decoded.src).toBe('https://images.dog.ceo/breeds/pug/a.jpg');
    expect(r.decoded.metadata.es).toEqual({ title: 'Carlino ñ', body: '¡Hola!' });
    expect(r.decoded.filter.code).toBe('sepia(1)');
    expect(r.rejects).toEqual([true, true, true]);
});

test('picks the caption language closest to the viewer', async ({ newProfile }) => {
    const page = await newProfile({ locale: 'pt-BR' });
    await openBlankPage(page);
    const picks = await page.evaluate(async () => {
        const { pickLanguage } = await import('/js/i18n.js');
        return [
            pickLanguage({ en: {}, 'pt-BR': {} }),
            pickLanguage({ en: {}, pt: {} }),
            pickLanguage({ fr: {}, de: {} }),
            pickLanguage({}),
        ];
    });
    expect(picks).toEqual(['pt-BR', 'pt', 'fr', undefined]);
});
