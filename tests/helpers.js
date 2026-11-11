/**
 * Shared test helpers.
 *
 * mockDogApi(page) answers Dog API requests with fixed data and generated
 * images, so tests don't depend on the network or on which random dogs the
 * real API returns.
 */
import { deflateSync } from 'node:zlib';
import { test as base, expect } from '@playwright/test';

/* ---------- test fixtures ---------- */

/**
 * WebKit only allows OPFS in a saved (persistent) browser profile; Playwright's
 * default throwaway profile acts like a Safari private window, where it fails.
 * So in WebKit each test gets its own temporary persistent profile.
 *
 * Playwright's WebKit also shares OPFS between profiles on the same origin, so
 * WebKit tests run one at a time (see playwright.config.js) and each profile
 * starts by emptying OPFS.
 *
 * `newProfile(options)` opens a page in another separate, empty profile, for
 * "a different browser" tests (sharing, restoring a backup).
 */
async function webkitProfile(playwright, dir, options) {
    const context = await playwright.webkit.launchPersistentContext(dir, options);
    const page = context.pages()[0] ?? await context.newPage();
    await openBlankPage(page);
    await page.evaluate(async () => (await navigator.storage.getDirectory()).removeEntry('images', { recursive: true }).catch(() => {}));
    await page.unroute('**/__blank.html');
    return context;
}

export const test = base.extend({
    newProfile: async ({ browser, browserName, playwright, baseURL }, use, testInfo) => {
        const opened = [];
        await use(async (options = {}) => {
            const context = browserName === 'webkit'
                ? await webkitProfile(playwright, testInfo.outputPath(`profile-${opened.length}`), { baseURL, ...options })
                : await browser.newContext({ baseURL, ...options });
            opened.push(context);
            return context.pages()[0] ?? context.newPage();
        });
        await Promise.all(opened.map((context) => context.close()));
    },
    context: async ({ context, browserName, playwright, baseURL, viewport }, use, testInfo) => {
        if (browserName !== 'webkit') return use(context);
        const persistent = await webkitProfile(playwright, testInfo.outputPath('profile'), { baseURL, viewport });
        await use(persistent); // the built-in `page` fixture opens its page in this context
        await persistent.close();
    },
});
export { expect };

/* ---------- tiny PNG generator (so there are no image files to commit) ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
}

/** A solid-color PNG. */
export function makePng(width = 8, height = 8, [r, g, b] = [69, 0, 132]) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: RGB
    const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
    const pixels = Buffer.concat(Array.from({ length: height }, () => row));
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/* ---------- Dog API mock ---------- */

export const BREEDS = { hound: ['afghan'], pug: [], retriever: ['golden'], stbernard: [] };

/** Image URLs the mock returns for a breed path like "hound/afghan" (or random). */
export function imageUrls(breedPath = 'random', count = 12) {
    const dir = breedPath === 'random' ? 'pug' : breedPath.replace('/', '-');
    return Array.from({ length: count }, (_, i) => `https://images.dog.ceo/breeds/${dir}/test_${breedPath.replace('/', '_')}_${i}.jpg`);
}

/**
 * Route Dog API and image requests to fake responses.
 * @returns {{ imageRequests: string[] }} URLs of images requested (live array)
 */
export async function mockDogApi(page) {
    const imageRequests = [];
    await page.route('https://dog.ceo/api/**', (route) => {
        const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
        const random = /^\/breeds\/image\/random\/(\d+)$/.exec(path);
        const byBreed = /^\/breed\/(.+)\/images\/random\/(\d+)$/.exec(path);
        let message;
        if (path === '/breeds/list/all') message = BREEDS;
        else if (random) message = imageUrls('random', Number(random[1]));
        else if (byBreed && BREEDS[byBreed[1].split('/')[0]]) message = imageUrls(byBreed[1], Number(byBreed[2]));
        if (!message) return route.fulfill({ status: 404, json: { status: 'error', message: 'Breed not found' } });
        return route.fulfill({ json: { status: 'success', message }, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.route('https://images.dog.ceo/**', (route) => {
        imageRequests.push(route.request().url());
        return route.fulfill({ body: makePng(), contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    return { imageRequests };
}

/* ---------- testing modules directly ---------- */

/**
 * Open an empty page on the app's origin (without running the app), so a test
 * can import modules from /js/ and call them with page.evaluate().
 */
export async function openBlankPage(page) {
    await page.route('**/__blank.html', (route) => route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><meta charset="utf-8"><main id="main"></main><div id="toast"></div>',
    }));
    await page.goto('/__blank.html');
}

/** Accept every confirm()/prompt() dialog, answering prompts with `answer`. */
export function acceptDialogs(page, answer = '') {
    page.on('dialog', (dialog) => dialog.accept(dialog.type() === 'prompt' ? answer : undefined));
}
