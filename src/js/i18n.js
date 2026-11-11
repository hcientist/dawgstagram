/**
 * Helpers for the multilingual `metadata` objects on Dawgs and Filters:
 *   { "en": { title, body }, "es": { title, body }, ... }
 */

/** The viewer's preferred languages, most preferred first. */
export function preferredLanguages() {
    return navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
}

/**
 * Choose which language of `metadata` to show the viewer.
 * Exact match (e.g. "pt-BR") wins, then primary subtag ("pt"), then the first entry.
 * @returns {string|undefined} a key of `metadata`
 */
export function pickLanguage(metadata = {}) {
    const available = Object.keys(metadata);
    if (!available.length) return undefined;
    const lower = available.map((l) => l.toLowerCase());
    for (const wanted of preferredLanguages()) {
        const w = wanted.toLowerCase();
        const exact = lower.indexOf(w);
        if (exact !== -1) return available[exact];
        const primary = lower.findIndex((l) => l.split('-')[0] === w.split('-')[0]);
        if (primary !== -1) return available[primary];
    }
    return available[0];
}

/** Human-readable name of a language tag, in the viewer's language. */
export function languageName(tag) {
    try {
        return new Intl.DisplayNames(preferredLanguages(), { type: 'language' }).of(tag) ?? tag;
    } catch {
        return tag;
    }
}

/** Is `tag` a well-formed BCP 47 language tag like "en" or "pt-BR"? */
export function isLanguageTag(tag) {
    try {
        return Intl.getCanonicalLocales(tag).length === 1;
    } catch {
        return false;
    }
}

