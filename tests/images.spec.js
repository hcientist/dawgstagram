// Image storage in OPFS (images.js), and how the store uses it.
import { test, expect, openBlankPage, mockDogApi } from './helpers.js';

test.beforeEach(async ({ page }) => {
    await mockDogApi(page);
    await openBlankPage(page);
});

/** Wait until `fn` (run in the page) returns something truthy. */
const waitFor = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 10_000 });

test('favoriting a Dog API image stores it in OPFS; localStorage only holds a reference', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const images = await import('/js/images.js');
        const url = 'https://images.dog.ceo/breeds/pug/one.jpg';
        // two quick clicks shouldn't make two dawgs
        const [h1, h2] = await Promise.all([store.ensureDawg(url, { en: { title: 'Pug' } }), store.ensureDawg(url, { en: { title: 'Pug' } })]);
        store.addToList(store.FAVORITES, h1);
        const dawg = store.getDawg(h1);
        const blob = await images.getBlob(dawg.file);
        return {
            same: h1 === h2,
            file: dawg.file,
            size: blob.size,
            type: blob.type,
            reused: (await images.saveFromUrl(url)) === dawg.file,
            stored: localStorage.getItem('dawgstagram:v1'),
        };
    });
    expect(r.same).toBe(true);
    expect(r.file).toMatch(/^[0-9a-f]{64}\.png$/); // named by a hash of the URL
    expect(r.size).toBeGreaterThan(0);
    expect(r.type).toBe('image/png');
    expect(r.reused).toBe(true);
    expect(r.stored).not.toContain('data:');
    expect(r.stored).toContain(r.file);
});

test('uploads are stored in OPFS and referenced as opfs:<file>', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const images = await import('/js/images.js');
        const canvas = Object.assign(document.createElement('canvas'), { width: 40, height: 40 });
        canvas.getContext('2d').fillRect(0, 0, 20, 20);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        const file = await images.saveBlob(blob);
        const h = store.createDawg({ src: images.OPFS_PREFIX + file, file, metadata: { en: { title: 'Mine' } } });
        store.addToList(store.FAVORITES, h);
        let notImage;
        try { await images.saveBlob(new Blob(['hi'], { type: 'text/plain' })); } catch (e) { notImage = e.message; }
        return { file, dawg: store.getDawg(h), size: (await images.getBlob(file)).size, notImage };
    });
    expect(r.dawg.src).toBe(`opfs:${r.file}`);
    expect(r.size).toBeGreaterThan(0);
    expect(r.notImage).toBeTruthy();
});

test('adding a dawg without a stored image to a list stores it (retry after a failed download)', async ({ page }) => {
    await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const h = store.createDawg({ src: 'https://images.dog.ceo/breeds/pug/retry.jpg', file: null, metadata: {} });
        store.addToList(store.FAVORITES, h);
        window.handle = h;
    });
    await waitFor(page, async () => !!(await import('/js/store.js')).getDawg(window.handle).file);

    // also when the dawg is already in that list
    await page.evaluate(async () => {
        const store = await import('/js/store.js');
        store.updateDawg(window.handle, { file: null });
        store.addToList(store.FAVORITES, window.handle);
    });
    await waitFor(page, async () => !!(await import('/js/store.js')).getDawg(window.handle).file);
});

test('images that can’t be downloaded fall back to their URL', async ({ page }) => {
    await page.route('https://no-cors.example/**', (route) => route.fulfill({ status: 404 }));
    const file = await page.evaluate(async () => (await import('/js/images.js')).saveFromUrl('https://no-cors.example/dog.jpg'));
    expect(file).toBeNull();
});

test('old data: URL dawgs are moved into OPFS', async ({ page }) => {
    const dawg = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const canvas = Object.assign(document.createElement('canvas'), { width: 4, height: 4 });
        const h = store.createDawg({ src: canvas.toDataURL('image/png'), metadata: {} });
        store.addToList(store.FAVORITES, h);
        await store.storeMissingImages();
        return store.getDawg(h);
    });
    expect(dawg.file).toBeTruthy();
    expect(dawg.src).toBe(`opfs:${dawg.file}`);
});

test('stored images are displayed from blob: URLs', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const store = await import('/js/store.js');
        const { dawgImg } = await import('/js/components.js');
        const h = await store.ensureDawg('https://images.dog.ceo/breeds/pug/show.jpg', {});
        const img = dawgImg(store.getDawg(h));
        document.body.append(img);
        await new Promise((resolve) => { const t = setInterval(() => img.src && (clearInterval(t), resolve()), 20); });
        await img.decode();
        return { src: img.src, width: img.naturalWidth };
    });
    expect(r.src).toMatch(/^blob:/);
    expect(r.width).toBe(8);
});

test('Dog API images display in CORS mode; other hosts don’t', async ({ page }) => {
    const modes = await page.evaluate(async () => {
        const { dawgImg } = await import('/js/components.js');
        return [dawgImg({ src: 'https://images.dog.ceo/breeds/pug/a.jpg' }).crossOrigin, dawgImg({ src: 'https://example.com/a.jpg' }).crossOrigin];
    });
    expect(modes).toEqual(['anonymous', null]);
});

test('unused images are deleted, but not ones written in the last minute', async ({ page }) => {
    const r = await page.evaluate(async () => {
        const images = await import('/js/images.js');
        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
        const keep = await images.saveBlob(blob);
        const recent = await images.saveBlob(blob);
        await images.removeUnused(new Set([keep]));
        const recentKept = await images.exists(recent);

        // pretend a minute has passed
        const realNow = Date.now;
        Date.now = () => realNow() + 61_000;
        await images.removeUnused(new Set([keep]));
        Date.now = realNow;
        return { recentKept, keepKept: await images.exists(keep), recentGone: !(await images.exists(recent)) };
    });
    expect(r).toEqual({ recentKept: true, keepKept: true, recentGone: true });
});

test('writes through a worker when the page can’t write directly (older Safari)', async ({ page }) => {
    const r = await page.evaluate(async () => {
        delete FileSystemFileHandle.prototype.createWritable; // simulate a browser without it
        const images = await import('/js/images.js');
        const name = await images.saveBlob(new Blob([new Uint8Array([9, 8, 7, 6])], { type: 'image/png' }));
        return [...new Uint8Array(await (await images.getBlob(name)).arrayBuffer())];
    });
    expect(r).toEqual([9, 8, 7, 6]);
});
