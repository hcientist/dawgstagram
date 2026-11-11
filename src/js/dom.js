/**
 * Tiny DOM helpers. Building elements with `el()` (instead of innerHTML) means
 * text from users and shared links is never interpreted as HTML.
 */

/**
 * Create an element.
 * @param {string} tag
 * @param {object} [props] attributes; `on*` functions become event listeners,
 *   `class` sets className, booleans toggle attributes, null/undefined are skipped.
 * @param {...(Node|string|number|null|false|Array)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    const { value: initialValue, ...rest } = props ?? {};
    for (const [key, value] of Object.entries(rest)) {
        if (value === null || value === undefined || value === false) continue;
        if (key.startsWith('on') && typeof value === 'function') {
            node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'class') {
            node.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(node.style, value);
        } else if (key === 'dataset') {
            Object.assign(node.dataset, value);
        } else if (key in node && typeof value !== 'string') {
            node[key] = value; // e.g. value, checked, selected
        } else {
            node.setAttribute(key, value === true ? '' : value);
        }
    }
    append(node, children);
    // Set `value` last so a <select> already has its <option>s (and <textarea> works).
    if (initialValue !== undefined && initialValue !== null) node.value = initialValue;
    return node;
}

function append(node, children) {
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : String(child));
    }
}

/** Replace all children of `node`. */
export function replaceChildren(node, ...children) {
    node.replaceChildren();
    append(node, children);
}

let toastTimer;
/** Show a short message on screen, and announce it to screen readers. */
export function toast(message) {
    const node = document.getElementById('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3500);
}

let idCounter = 0;
/** A unique id for wiring <label for> and aria-* attributes. */
export const uid = (prefix = 'id') => `${prefix}-${++idCounter}`;

/**
 * Re-render a region while keeping keyboard focus on the "same" control,
 * identified by a `data-key` attribute. Without this, focus would jump to
 * <body> whenever data changes and the region re-renders.
 */
export function rerender(container, render) {
    const key = document.activeElement?.closest?.('[data-key]')?.dataset.key;
    const hadFocus = container.contains(document.activeElement);
    render();
    if (hadFocus && key) {
        container.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
    }
}
