// Tests against the real Dog API. Tagged @network: skip them offline with `npm run test:offline`.
//
// Mocking requests turns off the browser's HTTP cache, so checking that a
// favorited image is saved from the cache (not downloaded twice) needs the
// real network.
import { test, expect } from './helpers.js';

test('@network the real Dog API works, and favoriting reuses the cached image', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'transferSize is reported reliably by Chromium');
    await page.goto('/');
    const first = page.locator('main .card').first();
    await expect(first.getByRole('img')).toHaveJSProperty('complete', true);
    const src = await first.getByRole('img').getAttribute('src');
    expect(src).toMatch(/^https:\/\/images\.dog\.ceo\//);

    await first.getByRole('button', { name: /Favorite/ }).click();
    await expect(first.getByRole('button', { name: /Favorited/ })).toBeVisible();

    const r = await page.evaluate(async (src) => {
        const store = await import('/js/store.js');
        const images = await import('/js/images.js');
        const dawg = store.findDawgBySrc(src);
        return {
            stored: !!dawg?.file && (await images.exists(dawg.file)),
            transfers: performance.getEntriesByName(src).map((e) => e.transferSize),
        };
    }, src);
    expect(r.stored).toBe(true);
    expect(r.transfers.length).toBeGreaterThanOrEqual(2); // shown, then saved (and maybe re-shown)
    expect(r.transfers.slice(1).every((size) => size === 0)).toBe(true); // all but the first came from the browser cache
});
