/**
 * Just enough of the ZIP format (https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
 * to write and read Dawgstagram backups, with no library.
 *
 * Writing uses method 0 ("stored", no compression): images are already
 * compressed, and the JSON is small. Reading also accepts method 8
 * ("deflate"), using the browser's DecompressionStream, so a backup that was
 * re-zipped by another tool still imports.
 */

/* ---------- CRC-32, the checksum ZIP uses ---------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP stores modification times in MS-DOS format. */
function dosDateTime(date) {
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

/* ---------- writing ---------- */

/**
 * Build a zip file.
 * @param {Array<{name: string, data: Uint8Array|string|Blob}>} entries
 * @returns {Promise<Blob>}
 */
export async function createZip(entries) {
    const encoder = new TextEncoder();
    const { time, date } = dosDateTime(new Date());
    const parts = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
        const name = encoder.encode(entry.name);
        const data = entry.data instanceof Uint8Array ? entry.data
            : typeof entry.data === 'string' ? encoder.encode(entry.data)
            : new Uint8Array(await entry.data.arrayBuffer());
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true); // local file header signature
        local.setUint16(4, 20, true);         // version needed to extract (2.0)
        local.setUint16(6, 0x0800, true);     // flags: file names are UTF-8
        local.setUint16(8, 0, true);          // method: stored
        local.setUint16(10, time, true);
        local.setUint16(12, date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true); // compressed size
        local.setUint32(22, data.length, true); // uncompressed size
        local.setUint16(26, name.length, true);
        local.setUint16(28, 0, true);           // extra field length
        parts.push(local, name, data);

        const header = new DataView(new ArrayBuffer(46));
        header.setUint32(0, 0x02014b50, true); // central directory header signature
        header.setUint16(4, 20, true);         // version made by
        header.setUint16(6, 20, true);         // version needed
        header.setUint16(8, 0x0800, true);
        header.setUint16(10, 0, true);
        header.setUint16(12, time, true);
        header.setUint16(14, date, true);
        header.setUint32(16, crc, true);
        header.setUint32(20, data.length, true);
        header.setUint32(24, data.length, true);
        header.setUint16(28, name.length, true);
        // 30: extra length, 32: comment length, 34: disk, 36: internal attrs, 38: external attrs (all 0)
        header.setUint32(42, offset, true);    // where the local header starts
        central.push(header, name);

        offset += 30 + name.length + data.length;
    }

    const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); // end of central directory signature
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

/* ---------- reading ---------- */

/** Does this file start with the ZIP signature "PK\x03\x04"? */
export function isZip(bytes) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Read every file in a zip.
 * @param {Uint8Array} bytes
 * @returns {Promise<Map<string, Uint8Array>>} file name -> contents
 */
export async function readZip(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // The end-of-central-directory record is at the end, before an optional comment (≤ 65535 bytes).
    let end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
        if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
    }
    if (end === -1) throw new Error('That zip file looks damaged.');

    const count = view.getUint16(end + 10, true);
    let pos = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    const files = new Map();

    for (let i = 0; i < count; i++) {
        if (view.getUint32(pos, true) !== 0x02014b50) throw new Error('That zip file looks damaged.');
        const method = view.getUint16(pos + 10, true);
        const compressedSize = view.getUint32(pos + 20, true);
        const nameLength = view.getUint16(pos + 28, true);
        const extraLength = view.getUint16(pos + 30, true);
        const commentLength = view.getUint16(pos + 32, true);
        const localOffset = view.getUint32(pos + 42, true);
        const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
        pos += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/')) continue; // a folder
        const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const data = bytes.subarray(dataStart, dataStart + compressedSize);

        if (method === 0) files.set(name, data);
        else if (method === 8) files.set(name, await inflate(data));
        else throw new Error(`“${name}” uses a zip compression method Dawgstagram can’t read.`);
    }
    return files;
}

async function inflate(data) {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}
