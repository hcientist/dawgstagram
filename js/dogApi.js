/**
 * Thin wrapper around the Dog API: https://dog.ceo/dog-api/documentation/
 */

const BASE = 'https://dog.ceo/api';

async function get(path) {
    const response = await fetch(`${BASE}${path}`);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.status !== 'success') {
        throw new Error(json.message || `Dog API request failed (${response.status})`);
    }
    return json.message;
}

// The Dog API runs some multi-word breed names together.
const SPACED = {
    stbernard: 'st. bernard', mexicanhairless: 'mexican hairless', germanshepherd: 'german shepherd',
    cotondetulear: 'coton de tulear', pitbull: 'pit bull', bullterrier: 'bull terrier',
    shihtzu: 'shih tzu', lhasa: 'lhasa apso', mountain: 'mountain dog',
};
const titleCase = (s) => s.split(' ').map((w) => SPACED[w] ?? w).join(' ').replace(/\b\w/g, (c) => c.toUpperCase());

let breedsPromise;
/**
 * All breeds and sub-breeds, e.g. { label: "Afghan Hound", path: "hound/afghan" }.
 * Cached for the life of the page.
 */
export function listBreeds() {
    breedsPromise ??= get('/breeds/list/all')
        .then((all) => Object.entries(all).flatMap(([breed, subs]) => [
            { label: titleCase(breed), path: breed },
            ...subs.map((sub) => ({ label: titleCase(`${sub} ${breed}`), path: `${breed}/${sub}` })),
        ]))
        .catch((error) => {
            breedsPromise = undefined; // allow a retry later
            throw error;
        });
    return breedsPromise;
}

/** Random image URLs, optionally for one breed path like "hound/afghan". */
export function randomImages(breedPath, count = 12) {
    return breedPath
        ? get(`/breed/${breedPath}/images/random/${count}`)
        : get(`/breeds/image/random/${count}`);
}

/**
 * Guess a breed name from a Dog API image URL, e.g.
 * https://images.dog.ceo/breeds/hound-afghan/n02088094_1003.jpg -> "Afghan Hound"
 * @returns {string|null}
 */
export function breedFromUrl(url) {
    const match = /images\.dog\.ceo\/breeds\/([^/]+)\//.exec(url);
    if (!match) return null;
    const [breed, sub] = match[1].split('-');
    return titleCase(sub ? `${sub} ${breed}` : breed);
}

/** Default English metadata for a Dog API image. */
export function defaultMetadata(url) {
    const breed = breedFromUrl(url);
    if (!breed) return { en: { title: 'A dawg', body: 'A photo of a dog.' } };
    const article = /^[aeiou]/i.test(breed) ? 'an' : 'a';
    return { en: { title: breed, body: `A photo of ${article} ${breed} dog.` } };
}
