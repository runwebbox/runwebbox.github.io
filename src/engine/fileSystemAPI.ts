import {
  type FSEntry,
  type FSEntryInfo,
  type FileSystemAPI,
  type FSEvent,
  isFSDirectory,
  isFSFile,
} from './fileSystem';

export function createFileSystemAPI(root: FSEntry): FileSystemAPI {
  const eventListeners: Set<(event: FSEvent) => void> = new Set();

  const emitEvent = (event: FSEvent) => {
    for (const listener of eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Event listener error:', err);
      }
    }
  };

  const normalizePath = (path: string): string[] => {
    return path.split('/').filter(p => p.length > 0);
  };

  const findItem = (path: string): FSEntry | null => {
    const parts = normalizePath(path);
    let current: FSEntry = root;

    for (const part of parts) {
      if (!isFSDirectory(current)) {
        return null;
      }
      const child = current.content.find(c => c.name === part);
      if (!child) return null;
      current = child;
    }
    return current;
  };

  const cloneEntry = (entry: FSEntry): FSEntry => {
    if (isFSFile(entry)) {
      return {
        name: entry.name,
        content: entry.content.slice(),
      };
    } else {
      return {
        name: entry.name,
        content: entry.content.map(child => cloneEntry(child)),
      };
    }
  };

  return {
    addEventListener: (f: (event: FSEvent) => void) => {
      eventListeners.add(f);
    },

    removeEventListener: (f: (event: FSEvent) => void) => {
      eventListeners.delete(f);
    },

    readFile: async (path: string): Promise<Uint8Array> => {
      const item = findItem(path);
      if (!item || !isFSFile(item)) {
        throw new Error(`File not found: ${path}`);
      }
      return item.content;
    },

    writeFile: async (path: string, content: Uint8Array): Promise<void> => {
      const parts = normalizePath(path);
      const filename = parts.pop();
      if (!filename) throw new Error('Invalid path');

      let current = root;
      let currentPath = '';

      // Находим или создаем родительскую директорию
      for (const part of parts) {
        // Проверяем, что current - директория (нет content)
        if (isFSFile(current)) {
          throw new Error(`Cannot create directory inside a file: ${part}`);
        }
        currentPath += (currentPath ? '/' : '') + part;

        let child = current.content.find(c => c.name === part);

        if (!child) {
          // Создаем новую директорию
          child = {
            name: part,
            content: [],
          };
          current.content.push(child);
          emitEvent({
            type: 'create',
            entry_type: 'directory',
            path: currentPath,
          });
        } else if (!isFSDirectory(child)) {
          // Нельзя создать дочерний элемент внутри файла
          throw new Error(`Cannot create directory inside a file: ${part}`);
        }
        current = child;
      }

      // Проверяем, что current - директория
      if (!isFSDirectory(current)) {
        throw new Error(`Cannot write to a file as directory: ${path}`);
      }

      // Ищем существующий файл
      const existing = current.content.find(c => c.name === filename);

      if (existing) {
        if (isFSDirectory(existing)) {
          // Нельзя перезаписать директорию файлом
          throw new Error(`Cannot overwrite directory with file: ${filename}`);
        }
        // Обновляем существующий файл
        existing.content = content;
        emitEvent({
          type: 'edit',
          filename: path,
          content: content,
        });
      } else {
        // Создаем новый файл
        current.content.push({
          name: filename,
          content,
        });
        emitEvent({
          type: 'create',
          entry_type: 'file',
          path: path,
        });
      }
    },

    deleteEntry: async (
      path: string,
      onlyFile: boolean = true
    ): Promise<void> => {
      const item = findItem(path);
      if (!item) {
        throw new Error(`Entry not found: ${path}`);
      }

      if (!isFSFile(item) && onlyFile) {
        throw new Error(`Entry is directory: ${path}`);
      }

      // Удаляем файл из родительской директории
      const parts = normalizePath(path);
      const filename = parts.pop();
      const parentPath = parts.join('/');
      const parent = parts.length > 0 ? findItem(parentPath) : root;

      if (!parent || isFSFile(parent)) {
        throw new Error(`Parent directory not found for: ${path}`);
      }

      const index = parent.content.findIndex(c => c.name === filename);
      if (index !== -1) {
        parent.content.splice(index, 1);
        emitEvent({
          type: 'delete',
          entry_type: isFSFile(item) ? 'file' : 'directory',
          path,
        });
      }
    },

    readDir: (path: string): FSEntryInfo[] => {
      const item = findItem(path);
      if (!item || isFSFile(item)) {
        throw new Error(`Directory not found: ${path}`);
      }
      return item.content.map(e => ({
        name: e.name,
        type: isFSDirectory(e) ? 'directory' : 'file',
      }));
    },

    mkdir: async (path: string): Promise<void> => {
      const parts = normalizePath(path);
      let current = root;
      let currentPath = '';

      for (const part of parts) {
        // Проверяем, что current - директория
        if (!isFSDirectory(current)) {
          throw new Error(`Cannot create directory inside a file: ${part}`);
        }
        currentPath += (currentPath ? '/' : '') + part;
        let child = current.content.find(c => c.name === part);

        if (!child) {
          child = {
            name: part,
            content: [],
          };
          current.content.push(child);
          emitEvent({
            type: 'create',
            entry_type: 'directory',
            path: currentPath,
          });
        } else if (!isFSDirectory(child)) {
          // Нельзя создать директорию с именем существующего файла
          throw new Error(`Cannot create directory, file exists: ${part}`);
        }
        current = child;
      }
    },

    exists: (path: string): boolean => {
      return findItem(path) !== null;
    },

    stat: (path: string): FSEntryInfo => {
      const item = findItem(path);
      if (!item) {
        throw new Error(`Path not found: ${path}`);
      }
      return {
        name: item.name,
        type: isFSDirectory(item) ? 'directory' : 'file',
      };
    },

    fork: async (path: string): Promise<FileSystemAPI> => {
      const item = findItem(path);

      if (!item) {
        throw new Error(`Path not found: ${path}`);
      }

      if (!isFSDirectory(item)) {
        throw new Error(
          `Cannot fork from a file, path must be a directory: ${path}`
        );
      }

      // Создаем глубокую копию указанной директории
      const clonedRoot = cloneEntry(item);

      // Создаем новую файловую систему на основе копии
      return createFileSystemAPI(clonedRoot);
    },
  };
}
