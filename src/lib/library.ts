import { Directory, File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { BUNDLED_MODELS } from '../models/bundled';
import type { LibraryModel } from '../types';
import { InvalidGlbError, readGlbStats } from './glb';

type StoredModel = Omit<LibraryModel, 'source' | 'origin'> & { file: string };
type Index = { version: 1; models: StoredModel[] };

const modelsDir = new Directory(Paths.document, 'models');
const indexFile = new File(modelsDir, 'index.json');

function ensureDir() {
  if (!modelsDir.exists) modelsDir.create({ intermediates: true });
}

function readIndex(): Index {
  try {
    if (!indexFile.exists) return { version: 1, models: [] };
    const parsed = JSON.parse(indexFile.textSync()) as Index;
    return parsed?.version === 1 && Array.isArray(parsed.models) ? parsed : { version: 1, models: [] };
  } catch {
    return { version: 1, models: [] };
  }
}

function writeIndex(index: Index) {
  ensureDir();
  indexFile.write(JSON.stringify(index));
}

function toLibraryModel(stored: StoredModel): LibraryModel {
  const { file, ...rest } = stored;
  return { ...rest, origin: 'imported', source: { uri: new File(modelsDir, file).uri } };
}

/** Bundled models first (stable order), then user imports newest-first. */
export function loadLibrary(): LibraryModel[] {
  const imported = readIndex()
    .models.filter((m) => new File(modelsDir, m.file).exists)
    .map(toLibraryModel)
    .sort((a, b) => b.addedAt - a.addedAt);
  return [...BUNDLED_MODELS, ...imported];
}

function prettyName(fileName: string): string {
  return fileName
    .replace(/\.glb$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export type ImportResult =
  | { status: 'added'; model: LibraryModel }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

/**
 * Opens the system file picker, validates the file is a real GLB and copies it
 * into the app's private models folder so it keeps working after the picker's
 * temporary copy is cleaned up.
 */
export async function importModelFromDevice(): Promise<ImportResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    // GLB has no universally registered MIME type on Android, so accept anything and validate ourselves.
    type: ['model/gltf-binary', 'application/octet-stream', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (picked.canceled || !picked.assets?.[0]) return { status: 'cancelled' };

  const asset = picked.assets[0];
  const temp = new File(asset.uri);
  try {
    const stats = readGlbStats(temp);
    ensureDir();
    const id = `imported:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const fileName = `${id.replace(':', '_')}.glb`;
    const dest = new File(modelsDir, fileName);
    await temp.copy(dest);

    const stored: StoredModel = {
      id,
      name: prettyName(asset.name || 'Model'),
      size: dest.size ?? asset.size ?? 0,
      file: fileName,
      stats,
      addedAt: Date.now(),
    };
    const index = readIndex();
    index.models.push(stored);
    writeIndex(index);
    return { status: 'added', model: toLibraryModel(stored) };
  } catch (e) {
    const message =
      e instanceof InvalidGlbError
        ? `"${asset.name}" is not a valid .glb file.`
        : e instanceof Error
          ? e.message
          : 'Could not import this file.';
    return { status: 'error', message };
  } finally {
    try {
      if (temp.exists) temp.delete();
    } catch {
      // The picker's cache copy is best-effort cleanup only.
    }
  }
}

export function deleteImportedModel(model: LibraryModel) {
  if (model.origin !== 'imported') return;
  const index = readIndex();
  const stored = index.models.find((m) => m.id === model.id);
  index.models = index.models.filter((m) => m.id !== model.id);
  writeIndex(index);
  if (stored) {
    const file = new File(modelsDir, stored.file);
    if (file.exists) file.delete();
  }
}
