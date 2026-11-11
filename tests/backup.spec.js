// Export / import (backup.js) and the zip reader/writer (zip.js).
import { readFile } from 'node:fs/promises';
import { test, expect, openBlankPage, mockDogApi } from './helpers.js';

const FIXTURES = new URL('./fixtures/', import.meta.url);

test.beforeEach(async ({ page }) => {
    await mockDogApi(page);
    await openBlankPage(page);
});

/** Put a web dawg, an uploaded dawg, a list, and a custom filter in the page's store. */
async function seed(page) {
    return page.evaluate(async () => {
        const store = await import('/js/store.js');
        const images = await import('/js/images.js');
        const web = await store.ensureDawg('https://images.dog.ceo/breeds/pug/seed.jpg', { en: { title: 'Pug' }, es: { title: 'Carlino ñ' } });
        store.addToList(store.FAVORITES, web);
        const bytes = [137, 80, 78, 71, 1, 2, 3, 4, 5];
        const file = await images.saveBlob(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
        const up = store.createDawg({ src: images.OPFS_PREFIX + file, file, metadata: { en: { title: 'Mine' } } });
        store.createList('Fluffers');
        store.addToList('Fluffers', up);
        store.addToList('Fluffers', web);
        const filter = store.createFilter({ code: 'hue-rotate(45deg)', metadata: { en: { title: 'Tilt' } } });
        store.updateDawg(up, { filter });
        return { lists: store.snapshot().lists, bytes };
    });
}

/** Create a backup in the page and return it to the test as a Buffer. */
async function exportBackup(page, includeUploads) {
    const { base64, filename } = await page.evaluate(async (includeUploads) => {
        const backup = await import('/js/backup.js');
        const { blob, filename } = await backup.createBackup({ includeUploads });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return { base64: btoa(binary), filename };
    }, includeUploads);
    return { buffer: Buffer.from(base64, 'base64'), filename };
}

/** Import a backup (Buffer) into a page; returns the summary and resulting data. */
async function importBackup(page, buffer, name = 'backup') {
    return page.evaluate(async ({ base64, name }) => {
        const backup = await import('/js/backup.js');
        const store = await import('/js/store.js');
        const file = new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name);
        const parsed = await backup.readBackup(file);
        await backup.applyBackup(parsed);
        return { summary: parsed.summary, data: store.snapshot() };
    }, { base64: buffer.toString('base64'), name });
}

async function freshPage(newProfile) {
    const page = await newProfile(); // a different "browser": empty storage
    await mockDogApi(page);
    await openBlankPage(page);
    return page;
}

test('JSON export restores everything except uploaded images, in another browser', async ({ page, newProfile }) => {
    const { lists } = await seed(page);
    const { buffer, filename } = await exportBackup(page, false);
    expect(filename).toMatch(/^dawgstagram-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(buffer.toString()).app).toBe('dawgstagram');

    const other = await freshPage(newProfile);
    const { summary, data } = await importBackup(other, buffer, 'x.json');
    expect(summary).toEqual({ dawgs: 2, lists: 2, filters: 9, uploadsMissing: 1 });
    expect(data.lists).toEqual(lists);
    const mine = Object.values(data.dawgs).find((d) => d.metadata.en.title === 'Mine');
    expect(mine.file).toBeNull(); // kept, with descriptions, but no picture
    expect(data.filters[mine.filter].code).toBe('hue-rotate(45deg)');

    // the web image is downloaded again into this browser's OPFS
    await other.waitForFunction(async () => {
        const store = await import('/js/store.js');
        return store.allDawgs().some((d) => d.src.startsWith('https:') && d.file);
    });
});

test('JSON re-imported in the same browser keeps uploaded images', async ({ page }) => {
    await seed(page);
    const { buffer } = await exportBackup(page, false);
    const { summary, data } = await importBackup(page, buffer);
    expect(summary.uploadsMissing).toBe(0);
    expect(Object.values(data.dawgs).find((d) => d.metadata.en.title === 'Mine').file).toBeTruthy();
});

test('zip export includes uploaded images and restores them byte-for-byte', async ({ page, newProfile }) => {
    const { lists, bytes } = await seed(page);
    const { buffer, filename } = await exportBackup(page, true);
    expect(filename).toMatch(/\.zip$/);
    expect(buffer.subarray(0, 4)).toEqual(Buffer.from('PK\x03\x04', 'binary'));

    const other = await freshPage(newProfile);
    const { summary, data } = await importBackup(other, buffer, 'renamed.dat'); // detected by contents, not name
    expect(summary.uploadsMissing).toBe(0);
    expect(data.lists).toEqual(lists);
    expect(Object.values(data.dawgs).find((d) => d.metadata.es?.title === 'Carlino ñ')).toBeTruthy();

    const restored = await other.evaluate(async () => {
        const store = await import('/js/store.js');
        const images = await import('/js/images.js');
        const mine = store.allDawgs().find((d) => d.metadata.en.title === 'Mine');
        return [...new Uint8Array(await (await images.getBlob(mine.file)).arrayBuffer())];
    });
    expect(restored).toEqual(bytes);
});

test('imports a deflate-compressed zip made by another tool', async ({ page }) => {
    // tests/fixtures/deflate-backup.zip was made with the `zip` command-line tool (zip -9)
    const { summary, data } = await importBackup(page, await readFile(new URL('deflate-backup.zip', FIXTURES)));
    expect(summary).toEqual({ dawgs: 2, lists: 2, filters: 1, uploadsMissing: 0 });
    const upload = Object.values(data.dawgs).find((d) => d.src.startsWith('opfs:'));
    const size = await page.evaluate(async (file) => (await (await import('/js/images.js')).getBlob(file)).size, upload.file);
    expect(size).toBeGreaterThan(0);
});

test('rejects files that aren’t Dawgstagram backups, without changing anything', async ({ page }) => {
    await seed(page);
    const results = await page.evaluate(async () => {
        const backup = await import('/js/backup.js');
        const { createZip } = await import('/js/zip.js');
        const inputs = [
            new File(['{"hello":1}'], 'a.json'),
            new File(['not json'], 'b.txt'),
            new File(['{"app":"other","dawgs":{},"lists":{},"filters":{}}'], 'c.json'),
            new File([await createZip([{ name: 'readme.txt', data: 'hi' }])], 'd.zip'),
            new File([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])], 'e.zip'),
        ];
        const out = [];
        for (const file of inputs) {
            try { await backup.readBackup(file); out.push('accepted'); } catch (e) { out.push(e.message); }
        }
        return out;
    });
    for (const message of results) expect(message).not.toBe('accepted');
    const lists = await page.evaluate(async () => (await import('/js/store.js')).allLists().length);
    expect(lists).toBe(2);
});

test('import drops malformed entries', async ({ page }) => {
    const data = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        return store.normalizeData({
            dawgs: {
                ok: { src: 'https://images.dog.ceo/a.jpg', filter: 'missing', metadata: {} },
                evil: { src: 'javascript:alert(1)' },
                lonely: { src: 'https://images.dog.ceo/b.jpg' },
            },
            lists: { Mine: { dawgs: ['ok', 'ok', 'evil', 'ghost'] }, broken: 'nope' },
            filters: { bad: { code: 'url(https://x/y.svg)' }, good: { code: 'sepia(1)' } },
        });
    });
    expect(Object.keys(data.dawgs)).toEqual(['ok']); // lonely is in no list
    expect(data.dawgs.ok.filter).toBe('');
    expect(data.lists).toEqual({ Mine: { handle: 'Mine', dawgs: ['ok'] }, Favorites: { handle: 'Favorites', dawgs: [] } });
    expect(Object.keys(data.filters)).toEqual(['good']);
});

test('zip writer output reads back, with UTF-8 names', async ({ page }) => {
    const files = await page.evaluate(async () => {
        const { createZip, readZip } = await import('/js/zip.js');
        const blob = await createZip([{ name: 'hello.txt', data: 'hi ñ' }, { name: 'dir/ü.bin', data: new Uint8Array([0, 255]) }]);
        const read = await readZip(new Uint8Array(await blob.arrayBuffer()));
        return Object.fromEntries([...read].map(([k, v]) => [k, [...v]]));
    });
    expect(files).toEqual({ 'hello.txt': [...Buffer.from('hi ñ')], 'dir/ü.bin': [0, 255] });
});
