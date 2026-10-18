// Thin, typed-by-convention wrappers over the Netlify functions.
import { callFunction, downloadFile } from '../backend/index.js';
import { fileToBase64 } from './util.js';

export const ai = (mode, payload = {}) => callFunction('ai', { mode, ...payload });
export const cbt = (action, payload = {}) => callFunction('cbt', { action, ...payload });

// context: 'resource' | 'announcement' | 'assignment' | 'theory' | 'submission'
export async function uploadFile({ classId, context, file, assignmentId }) {
  const data = await fileToBase64(file);
  const res = await callFunction('files', { action: 'upload', classId, context, assignmentId, name: file.name, data });
  return { id: res.id, name: res.name, size: res.size, type: res.type };
}
export const deleteFile = (classId, id) => callFunction('files', { action: 'delete', classId, id });

// Open a stored file in a new tab (or download it when the browser won't open that type).
export async function openFile(classId, file) {
  // Open the tab first, inside the click, so pop-up blockers allow it.
  const tab = window.open('', '_blank');
  try {
    const blob = await downloadFile(classId, file.id);
    const url = URL.createObjectURL(blob);
    const viewable = /\.(pdf|png|jpe?g|gif|webp|txt)$/i.test(file.name || '');
    if (tab && viewable) {
      tab.location.href = url;
    } else {
      if (tab) tab.close();
      const a = document.createElement('a');
      a.href = url; a.download = file.name || 'file';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    if (tab) tab.close();
    throw e;
  }
}

export async function fileObjectUrl(classId, id) {
  const blob = await downloadFile(classId, id);
  return URL.createObjectURL(blob);
}
