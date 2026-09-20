import { useCallback, useEffect, useState } from 'react';

import { deleteImportedModel, importModelFromDevice, loadLibrary, type ImportResult } from '../lib/library';
import { ensureStoragePermission } from '../lib/permissions';
import type { LibraryModel } from '../types';

export function useLibrary() {
  const [models, setModels] = useState<LibraryModel[]>(() => loadLibrary());
  const [importing, setImporting] = useState(false);

  const refresh = useCallback(() => setModels(loadLibrary()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addFromDevice = useCallback(async (): Promise<ImportResult> => {
    if (importing) return { status: 'cancelled' };
    const allowed = await ensureStoragePermission();
    if (!allowed) return { status: 'error', message: 'Storage permission is required to import models.' };
    setImporting(true);
    try {
      const result = await importModelFromDevice();
      if (result.status === 'added') refresh();
      return result;
    } finally {
      setImporting(false);
    }
  }, [importing, refresh]);

  const remove = useCallback(
    (model: LibraryModel) => {
      deleteImportedModel(model);
      refresh();
    },
    [refresh],
  );

  return { models, importing, addFromDevice, remove };
}
