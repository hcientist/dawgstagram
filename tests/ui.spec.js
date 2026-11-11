// End-to-end: clicking through the real app, with the Dog API mocked.
import { test, expect, mockDogApi, acceptDialogs, makePng } from './helpers.js';

test.beforeEach(async ({ page }) => {
    await mockDogApi(page);
});

const cards = (page) => page.locator('main .card');

/** Favorite the first search result on Home and wait until it's saved. */
async function favoriteFirstResult(page) {
    await page.goto('/');
    await expect(cards(page)).toHaveCount(12);
    await page.getByRole('button', { name: /Favorite\s+Pug/ }).first().click();
    await expect(page.getByRole('button', { name: /Favorited\s+Pug/ })).toHaveCount(1);
}

test('navigation, page titles, and the current-page marker', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Find dawgs · Dawgstagram');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    for (const [name, title] of [['Favorites', 'Favorites'], ['Dawglists', 'Dawglists'], ['Filters', 'Filters']]) {
        await nav.getByRole('link', { name }).click();
        await expect(page).toHaveTitle(`${title} · Dawgstagram`);
        await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('main')).toBeFocused(); // focus moves to the new page
    }
    await page.goto('/#/nowhere');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('No dawgs here');
});

test('search by breed, and unknown breeds', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page)).toHaveCount(12);
    await page.getByLabel('Search by breed').fill('afghan');
    await page.getByRole('button', { name: /Search/ }).click();
    await expect(page.getByText('Showing 12 Afghan Hound dawgs.')).toBeVisible();
    await expect(cards(page).first().getByRole('heading')).toHaveText('Afghan Hound');
    await expect(cards(page).first().getByRole('img')).toHaveAttribute('alt', 'A photo of an Afghan Hound dog.');

    await page.getByLabel('Search by breed').fill('chihuahua');
    await page.getByRole('button', { name: /Search/ }).click();
    await expect(page.getByText(/No breed matches “chihuahua”/)).toBeVisible();
});

test('favoriting stores the image and shows it on Favorites', async ({ page }) => {
    await favoriteFirstResult(page);
    await page.getByRole('link', { name: 'Favorites' }).click();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).getByRole('img')).toHaveAttribute('src', /^blob:/); // from OPFS

    // un-favoriting from Home removes it
    await page.getByRole('link', { name: 'Home' }).click();
    await page.getByRole('button', { name: /Favorited\s+Pug/ }).click();
    await page.getByRole('link', { name: 'Favorites' }).click();
    await expect(page.getByText('No dawgs here yet.')).toBeVisible();
});

test('lists: add to a new list, rename, and delete', async ({ page }) => {
    await page.goto('/');
    await expect(cards(page)).toHaveCount(12);
    acceptDialogs(page, 'Fluffers');
    await page.getByLabel('Add Pug to a list').first().selectOption('__new__');
    await expect(page.locator('#toast')).toHaveText('Added to Fluffers.');

    await page.getByRole('link', { name: 'Dawglists' }).click();
    const sidebar = page.getByRole('navigation', { name: 'Dawglists' });
    await sidebar.getByRole('link', { name: /Fluffers/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fluffers');
    await expect(cards(page)).toHaveCount(1);

    page.removeAllListeners('dialog');
    acceptDialogs(page, 'Floofs');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(page).toHaveURL(/#\/lists\/Floofs$/);

    await page.getByRole('button', { name: 'Delete list' }).click();
    await expect(page).toHaveURL(/#\/lists$/);
    await expect(sidebar.getByRole('link', { name: /Floofs/ })).toHaveCount(0);
});

test('editing a dawg: filter, a second language, and delete', async ({ page }) => {
    await favoriteFirstResult(page);
    await page.goto('/#/favorites');

    await page.getByLabel('Filter for Pug').selectOption('sepia');
    await expect(cards(page).getByRole('img')).toHaveCSS('filter', 'sepia(1)');

    await page.getByRole('button', { name: /Edit\s+Pug/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit dawg' });
    await dialog.getByRole('button', { name: '+ Add another language' }).click();
    await dialog.getByLabel('Language code').nth(1).fill('es');
    await dialog.getByLabel('Title').nth(1).fill('Carlino');
    await dialog.getByLabel('Description').nth(1).fill('Un perro carlino.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();

    await page.getByLabel('Caption language').selectOption('es');
    await expect(cards(page).getByRole('heading')).toHaveText('Carlino');
    await expect(cards(page).getByRole('img')).toHaveAttribute('alt', 'Un perro carlino.');

    // a bad language code is caught
    await page.getByRole('button', { name: /^Edit/ }).click();
    await dialog.getByLabel('Language code').first().fill('not a language!');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    acceptDialogs(page);
    await page.getByRole('button', { name: /^Edit/ }).click();
    await dialog.getByRole('button', { name: 'Delete dawg' }).click();
    await expect(page.getByText('No dawgs here yet.')).toBeVisible();
});

test('uploading an image', async ({ page }) => {
    await page.goto('/#/favorites');
    await page.getByRole('button', { name: '+ Add from URL or upload' }).click();
    const dialog = page.getByRole('dialog', { name: 'New dawg' });
    await dialog.getByLabel('…or upload an image').setInputFiles({ name: 'my-dog.png', mimeType: 'image/png', buffer: makePng(30, 20) });
    await expect(dialog.getByText('Using my-dog.png.', { exact: false })).toBeVisible();
    await dialog.getByLabel('Title').fill('My dog');
    await dialog.getByRole('button', { name: 'Add dawg' }).click();
    await expect(dialog).toBeHidden();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).getByRole('img')).toHaveAttribute('src', /^blob:/);
    const src = await page.evaluate(async () => (await import('/js/store.js')).allDawgs()[0].src);
    expect(src).toMatch(/^opfs:.+\.jpg$/); // resized and stored as JPEG
});

test('creating a filter, with validation', async ({ page }) => {
    await page.goto('/#/filters');
    await page.getByText('+ Create a new filter').click();
    const code = page.getByLabel('Filter code (CSS)');
    await code.fill('banana(3)');
    await expect(page.getByRole('alert')).toHaveText('Your browser doesn’t understand that filter yet.');
    await code.fill('hue-rotate(180deg) saturate(3)');
    await expect(page.getByRole('img', { name: 'Sample dawg with this filter' })).toHaveCSS('filter', 'hue-rotate(180deg) saturate(3)');
    await page.getByLabel('Title').fill('Upside');
    await page.getByRole('button', { name: 'Create filter' }).click();
    await expect(page.getByRole('heading', { name: 'Upside' })).toBeVisible();
    await expect(cards(page)).toHaveCount(8);
});

test('sharing a dawg with someone else', async ({ page, newProfile }) => {
    await favoriteFirstResult(page);
    await page.goto('/#/favorites');
    await page.getByLabel('Filter for Pug').selectOption('invert');
    await page.getByRole('link', { name: /Share\s+Pug/ }).click();
    const url = await page.getByLabel('Link').inputValue();
    expect(url).toMatch(/#\/share\/[\w-]+$/);

    const friend = await newProfile();
    await mockDogApi(friend);
    await friend.goto(url);
    await expect(friend.getByRole('heading', { level: 1 })).toHaveText(/Someone shared a dawg with you/);
    await expect(friend.locator('main img')).toHaveCSS('filter', 'invert(1)');
    await friend.getByRole('button', { name: '♡ Save to my Favorites' }).click();
    await expect(friend.getByRole('button', { name: '♥ Saved to Favorites' })).toBeDisabled();
    await friend.goto('/#/favorites');
    await expect(friend.locator('main .card')).toHaveCount(1);

    await page.goto('/#/share/garbage');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hmm, that link didn’t work');
});

test('backing up to a zip and restoring in another browser', async ({ page, newProfile }) => {
    await favoriteFirstResult(page);
    await page.goto('/#/favorites');
    await page.getByRole('button', { name: '+ Add from URL or upload' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('…or upload an image').setInputFiles({ name: 'up.png', mimeType: 'image/png', buffer: makePng() });
    await dialog.getByLabel('Title').fill('Uploaded');
    await dialog.getByRole('button', { name: 'Add dawg' }).click();
    await expect(cards(page)).toHaveCount(2);

    await page.getByRole('link', { name: 'Back up or restore' }).click();
    await expect(page.getByLabel(/Include my 1 uploaded image/)).toBeChecked();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download backup/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.zip$/);
    const path = await download.path();

    const other = await newProfile();
    await mockDogApi(other);
    acceptDialogs(other);
    await other.goto('/#/backup');
    await other.getByLabel('Backup file').setInputFiles(path);
    await other.getByRole('button', { name: /Import backup/ }).click();
    await expect(other.locator('main').getByRole('status').filter({ hasText: 'Imported' })).toHaveText(/Imported 2 dawgs, 1 list, and 7 filters\./);
    await other.goto('/#/favorites');
    await expect(other.locator('main .card')).toHaveCount(2);
    await expect(other.locator('main .card img').first()).toHaveAttribute('src', /^blob:/);
});

test('without working OPFS (e.g. Safari private browsing) favorites still work and uploads explain why they can’t', async ({ page }) => {
    await page.addInitScript(() => {
        StorageManager.prototype.getDirectory = () => Promise.reject(new DOMException('The operation failed for an unknown transient reason', 'UnknownError'));
    });
    await favoriteFirstResult(page);
    await page.goto('/#/favorites');
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).getByRole('img')).toHaveAttribute('src', /^https:\/\/images\.dog\.ceo\//); // shown from the web instead

    await page.getByRole('button', { name: '+ Add from URL or upload' }).click();
    const dialog = page.getByRole('dialog', { name: 'New dawg' });
    await dialog.getByLabel('…or upload an image').setInputFiles({ name: 'up.png', mimeType: 'image/png', buffer: makePng() });
    await dialog.getByLabel('Title').fill('Nope');
    await dialog.getByRole('button', { name: 'Add dawg' }).click();
    await expect(page.locator('#toast')).toHaveText(/won’t let Dawgstagram store images/);
    await expect(dialog).toBeVisible(); // nothing lost; the viewer can paste a URL instead
});

test('phone layout matches the mobile sketch', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByText('DGram')).toBeVisible();
    await expect(page.locator('.brand-long')).toHaveCSS('position', 'absolute'); // hidden visually, still read aloud
    await expect(page.locator('[data-nav="home"]').first()).toBeHidden();
    await expect(page.getByText('Favs')).toBeVisible();
    for (const route of ['/', '/#/lists', '/#/filters', '/#/backup']) {
        await page.goto(route);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    }
});

test('every image has alt text', async ({ page }) => {
    await favoriteFirstResult(page);
    for (const route of ['/', '/#/favorites', '/#/filters']) {
        await page.goto(route);
        await expect(page.locator('main .card img').first()).toBeVisible();
        const missing = await page.locator('main img:not([alt])').count();
        expect(missing, `images without alt on ${route}`).toBe(0);
    }
});
