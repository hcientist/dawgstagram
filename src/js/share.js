/**
 * Share links. There is no server, so everything the visitor needs (image,
 * filter code, and descriptions) is packed into the link itself:
 *
 *   index.html#/share/<base64url(JSON)>
 */

import { getFilter } from './store.js';
import { OPFS_PREFIX, dataUrl } from './images.js';

function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

/**
 * Build a share URL for a stored dawg. Web images are shared by URL; uploaded
 * images only exist in this browser's OPFS, so their bytes go into the link.
 */
export async function shareUrl(dawg) {
    const filter = getFilter(dawg.filter);
    const src = dawg.src.startsWith(OPFS_PREFIX) ? await dataUrl(dawg.file) : dawg.src;
    const payload = {
        v: 1,
        src,
        metadata: dawg.metadata,
        filter: filter ? { code: filter.code, metadata: filter.metadata } : null,
    };
    const base = location.href.split('#')[0];
    return `${base}#/share/${toBase64Url(JSON.stringify(payload))}`;
}

/** Parse the part of a share URL after "#/share/". Throws if it's malformed. */
export function decodeShare(encoded) {
    const payload = JSON.parse(fromBase64Url(encoded));
    const okSrc = typeof payload?.src === 'string' && /^(https?:|data:image\/)/i.test(payload.src);
    if (!okSrc) throw new Error('This share link doesn’t contain a usable image.');
    return {
        src: payload.src,
        metadata: isPlainObject(payload.metadata) ? payload.metadata : {},
        filter: payload.filter && typeof payload.filter.code === 'string'
            ? { code: payload.filter.code, metadata: isPlainObject(payload.filter.metadata) ? payload.filter.metadata : {} }
            : null,
    };
}

const isPlainObject = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
