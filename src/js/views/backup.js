/**
 * #/backup — download a backup of everything, or restore from one.
 */

import { el, replaceChildren, toast, uid } from '../dom.js';
import * as backup from '../backup.js';
import { confirmAction } from '../components.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function backupView(main) {
    replaceChildren(main,
        el('h1', {}, 'Back up & restore'),
        el('p', { class: 'muted' }, 'Your dawgs live only in this browser. Download a backup to keep them safe, or to move them to another browser or device.'),
        exportPanel(),
        importPanel(),
    );
}

function exportPanel() {
    const uploads = backup.uploadCount();
    const checkboxId = uid('uploads');
    const checkbox = el('input', { id: checkboxId, type: 'checkbox', checked: uploads > 0, disabled: uploads === 0 });
    const button = el('button', { type: 'submit', class: 'btn' }, '⬇ Download backup');

    return el('form', {
        class: 'panel',
        onsubmit: async (e) => {
            e.preventDefault();
            button.disabled = true;
            try {
                const { blob, filename, missing } = await backup.createBackup({ includeUploads: checkbox.checked });
                backup.download(blob, filename);
                toast(missing ? `Downloaded ${filename}, but ${plural(missing, 'uploaded image')} couldn’t be read.` : `Downloaded ${filename}.`);
            } catch (error) {
                toast(`Couldn’t make a backup: ${error.message}`);
            } finally {
                button.disabled = false;
            }
        },
    },
        el('h2', { style: { marginTop: 0 } }, 'Export'),
        el('p', {}, 'Saves all your dawgs, lists, and filters. Dog API and other web images are downloaded again when you import.'),
        el('div', { class: 'field' },
            el('label', { for: checkboxId, style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
                checkbox,
                uploads
                    ? `Include my ${plural(uploads, 'uploaded image')} (makes a .zip file)`
                    : 'Include uploaded images (you haven’t uploaded any)',
            ),
            el('span', { class: 'hint' }, 'Without this you get a small .json file, and uploaded dawgs come back with their descriptions but no picture.'),
        ),
        button,
    );
}

function importPanel() {
    const fileId = uid('import');
    const input = el('input', { id: fileId, type: 'file', accept: '.json,.zip,application/json,application/zip', required: true });
    const status = el('p', { role: 'status' });
    const button = el('button', { type: 'submit', class: 'btn' }, '⬆ Import backup');

    return el('form', {
        class: 'panel',
        onsubmit: async (e) => {
            e.preventDefault();
            const file = input.files[0];
            if (!file) return;
            button.disabled = true;
            status.textContent = `Reading ${file.name}…`;
            try {
                const parsed = await backup.readBackup(file);
                const { dawgs, lists, filters, uploadsMissing } = parsed.summary;
                const found = `${plural(dawgs, 'dawg')}, ${plural(lists, 'list')}, and ${plural(filters, 'filter')}`;
                const warning = uploadsMissing ? `\n\n${plural(uploadsMissing, 'uploaded image')} ${uploadsMissing === 1 ? 'isn’t' : 'aren’t'} in this backup, so ${uploadsMissing === 1 ? 'that dawg' : 'those dawgs'} will have no picture.` : '';
                if (!confirmAction(`This backup has ${found}.\n\nImporting replaces everything currently in Dawgstagram.${warning}\n\nImport it?`)) {
                    status.textContent = 'Import cancelled.';
                    return;
                }
                status.textContent = 'Importing…';
                await backup.applyBackup(parsed);
                status.textContent = `Imported ${found}.${uploadsMissing ? ` ${plural(uploadsMissing, 'uploaded image')} ${uploadsMissing === 1 ? 'wasn’t' : 'weren’t'} included.` : ''}`;
                toast('Backup imported.');
                input.value = '';
            } catch (error) {
                status.textContent = `Couldn’t import: ${error.message}`;
            } finally {
                button.disabled = false;
            }
        },
    },
        el('h2', { style: { marginTop: 0 } }, 'Import'),
        el('p', {}, 'Choose a .json or .zip backup from Dawgstagram.'),
        el('div', { class: 'field' }, el('label', { for: fileId }, 'Backup file'), input),
        button,
        status,
    );
}
