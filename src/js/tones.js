/**
 * Duotone and multi-tone filters.
 *
 * CSS has no duotone function, but an SVG filter can do it: turn the image
 * to grayscale, then map each shade of gray onto a gradient of colors
 * (black → the first color, white → the last). CSS can use an SVG filter
 * with `filter: url(#id)`.
 *
 * Filter code can't contain url() (a shared filter could point anywhere), so
 * Dawgstagram adds its own function, written like the CSS ones:
 *
 *   tones(#450084, #8ee4d7)                    duotone: shadows purple, highlights ice blue
 *   tones(#000, #450084, #009698, #fff)        four colors, darkest to lightest
 *   contrast(1.3) tones(#333, #f4c95d) blur(1px)   mixed with ordinary CSS filters
 *
 * toCss() swaps each tones(...) for url(#…) pointing at an SVG filter that it
 * builds from the colors (hex only, so nothing else can get into the page).
 */

const TONES = /tones\(([^()]*)\)/gi;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const MAX_STOPS = 8;

/** "#abc" -> "#aabbcc" */
const longHex = (hex) => (hex.length === 4 ? `#${[...hex.slice(1)].map((d) => d + d).join('')}` : hex);

/** "#aabbcc" -> [r, g, b], each 0–1. */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** The colors in a tones(...) call as "#rrggbb", or null if they aren't 2–8 hex colors. */
export function parseStops(args) {
    const stops = args.split(',').map((s) => s.trim().toLowerCase());
    return stops.length >= 2 && stops.length <= MAX_STOPS && stops.every((s) => HEX.test(s)) ? stops.map(longHex) : null;
}

/** Does `code` use tones() correctly (or not at all)? */
export function tonesAreValid(code) {
    return [...code.matchAll(TONES)].every(([, args]) => parseStops(args));
}

/** `code` with every tones(...) replaced by `replace(stops)`. */
function replaceTones(code, replace) {
    return code.replace(TONES, (_, args) => replace(parseStops(args)));
}

/** For checking the rest of the code with CSS.supports(): tones() becomes a harmless CSS filter. */
export const withoutTones = (code) => replaceTones(code, () => 'grayscale(1)');

/** Write tones(...) for a list of hex colors. */
export const tonesCode = (stops) => `tones(${stops.join(', ')})`;

/** The colors of the first valid tones(...) in `code`, or null. */
export function firstStops(code) {
    for (const [, args] of code.matchAll(TONES)) {
        const stops = parseStops(args);
        if (stops) return stops;
    }
    return null;
}

/** Does `code` contain a tones(...) call? */
export const hasTones = (code) => new RegExp(TONES.source, 'i').test(code);

/** Put these colors into `code`: replace its first tones(...), or add one at the end. */
export function setTones(code, stops) {
    if (!hasTones(code)) return [code.trim(), tonesCode(stops)].filter(Boolean).join(' ');
    let done = false;
    return code.replace(TONES, (match) => {
        if (done) return match;
        done = true;
        return tonesCode(stops);
    });
}

/* ---------- SVG filters in the page ---------- */

const SVG_NS = 'http://www.w3.org/2000/svg';
let defs;

/** The hidden <svg> that holds the generated filters. */
function filterDefs() {
    if (!defs?.isConnected) {
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.style.position = 'absolute';
        defs = document.createElementNS(SVG_NS, 'defs');
        svg.append(defs);
        document.body.append(svg);
    }
    return defs;
}

function svgEl(name, attributes, children = []) {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    node.append(...children);
    return node;
}

/** The id of an SVG filter for these colors, creating it the first time. */
function filterId(stops) {
    const id = `tones-${stops.map((s) => s.slice(1)).join('-')}`;
    const parent = filterDefs();
    if (!parent.querySelector(`#${id}`)) {
        const channels = [0, 1, 2].map((c) => stops.map((s) => rgb(s)[c].toFixed(3)).join(' '));
        parent.append(svgEl('filter', { id, 'color-interpolation-filters': 'sRGB' }, [
            // 1. Grayscale: the brightness of each pixel into R, G, and B.
            svgEl('feColorMatrix', {
                type: 'matrix',
                values: '0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0.2126 0.7152 0.0722 0 0  0 0 0 1 0',
            }),
            // 2. Map gray onto the colors: black → first color, white → last.
            svgEl('feComponentTransfer', {}, ['R', 'G', 'B'].map((name, c) => svgEl(`feFunc${name}`, { type: 'table', tableValues: channels[c] }))),
        ]));
    }
    return id;
}

/** Filter code → a CSS `filter` value the browser can use. */
export function toCss(code = '') {
    return replaceTones(code, (stops) => (stops ? `url("#${filterId(stops)}")` : ''));
}
