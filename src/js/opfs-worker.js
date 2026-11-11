/**
 * Writes files to OPFS for browsers that can only write from a worker
 * (FileSystemSyncAccessHandle). Used by images.js as a fallback.
 */
self.onmessage = async ({ data: { id, dir, name, blob } }) => {
    let access;
    try {
        const root = await navigator.storage.getDirectory();
        const directory = await root.getDirectoryHandle(dir, { create: true });
        const handle = await directory.getFileHandle(name, { create: true });
        access = await handle.createSyncAccessHandle();
        access.truncate(0);
        access.write(new Uint8Array(await blob.arrayBuffer()), { at: 0 });
        access.flush();
        self.postMessage({ id });
    } catch (error) {
        self.postMessage({ id, error: String(error?.message ?? error) });
    } finally {
        access?.close();
    }
};
