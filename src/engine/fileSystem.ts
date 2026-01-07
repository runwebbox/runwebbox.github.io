export interface FSDirectory {
  name: string;
  content: FSEntry[];
}
export interface FSFile {
  name: string;
  content: Uint8Array;
}
export type FSEntry = FSDirectory | FSFile;

export function isFSDirectory(entry: FSEntry): entry is FSDirectory {
  return Array.isArray((entry as FSDirectory).content);
}
export function isFSFile(entry: FSEntry): entry is FSFile {
  return (entry as FSFile).content instanceof Uint8Array;
}

export interface FSEntryInfo {
  name: string;
  type: 'directory' | 'file';
}

interface FSEventCreate {
  type: 'create';
  entry_type: 'directory' | 'file';
  path: string;
}

interface FSEventEdit {
  type: 'edit';
  filename: string;
  content: Uint8Array;
}

interface FSEventMove {
  type: 'move';
  entry_type: 'directory' | 'file';
  old_filename: string;
  new_filename: string;
}

interface FSEventDelete {
  type: 'delete';
  entry_type: 'directory' | 'file';
  path: string;
}

export type FSEvent = FSEventCreate | FSEventEdit | FSEventMove | FSEventDelete;

export interface FileSystemAPI {
  addEventListener: (f: (event: FSEvent) => void) => void;

  removeEventListener: (f: (event: FSEvent) => void) => void;
  /**
   * Читает содержимое файла по указанному пути
   * @param path - Путь к файлу (например: "/documents/file.txt")
   * @returns Promise<Uint8Array> - Содержимое файла в виде байтового массива
   * @throws {Error} - Если файл не найден или путь ведет к директории
   * @throws {Error} - Если файл не существует
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Создает или перезаписывает файл по указанному пути
   * @param path - Путь к файлу (например: "/documents/file.txt")
   * @param content - Содержимое файла в виде байтового массива
   * @returns Promise<void>
   * @throws {Error} - Если путь некорректен (например, пустая строка)
   * @throws {Error} - Если родительская директория не найдена
   * @throws {Error} - Если пытаетесь создать файл внутри другого файла
   * @throws {Error} - Если пытаетесь перезаписать директорию файлом
   */
  writeFile(path: string, content: Uint8Array): Promise<void>;

  /**
   * Удаляет файл или директорию по указанному пути
   * Директории удаляются рекурсивно вместе со всем содержимым
   * @param path - Путь к удаляемому элементу
   * @param onlyFile - Проверять что это удаляется файл
   * @returns Promise<void>
   * @throws {Error} - Если элемент не найден
   * @throws {Error} - Если родительская директория не найдена
   * @throws {Error} - Если onlyFile и элемент это файл
   */
  deleteEntry(path: string, onlyFile: boolean): Promise<void>;

  /**
   * Читает содержимое директории (список файлов и поддиректорий)
   * @param path - Путь к директории (например: "/documents")
   * @returns FSEntryInfo - Массив элементов в директории
   * @throws {Error} - Если директория не найдена
   * @throws {Error} - Если путь ведет к файлу (а не к директории)
   */
  readDir(path: string): FSEntryInfo[];

  /**
   * Создает директорию по указанному пути
   * @param path - Путь к создаваемой директории (например: "/documents/folder")
   * @returns Promise<void>
   * @throws {Error} - Если путь некорректен
   * @throws {Error} - Если пытаетесь создать директорию внутри файла
   * @throws {Error} - Если уже существует файл с таким именем
   */
  mkdir(path: string): Promise<void>;

  /**
   * Проверяет, существует ли файл или директория по указанному пути
   * @param path - Путь для проверки
   * @returns boolean - true, если элемент существует, иначе false
   * @throws {Error} - Не выбрасывает исключений, всегда возвращает boolean
   */
  exists(path: string): boolean;

  /**
   * Получает информацию (метаданные) о файле или директории
   * @param path - Путь к элементу файловой системы
   * @returns FSEntryInfo - Объект с информацией об элементе
   * @throws {Error} - Если элемент по указанному пути не найден
   */
  stat(path: string): FSEntryInfo;

  /**
   * Создает копию файловой системы, начиная с указанной директории
   * @param path - Путь к директории, с которой нужно создать копию
   * @returns FileSystemAPI - Новая независимая файловая система
   * @throws {Error} - Если путь не найден или указывает на файл
   */
  fork(path: string): Promise<FileSystemAPI>;
}
