import type {
  EventFromMachineFunction,
  EventMapToMachine,
  MachineModule,
} from './MachineModule';
import { type Packet } from '../packet';
import type { FileSystemAPI, FSEvent } from '../fileSystem';
import { V86 } from 'v86';
import type { V86Config } from '../../types/webBoxConfig';
import type { LogLvls } from '../log';
import { build_eth /*, parse_eth*/ } from '../TCPParser';

export default class V86Module implements MachineModule {
  private config: V86Config;
  private fileSystem: FileSystemAPI;
  //private sendPacketCallback: (packet: Packet, inter: number) => void;
  private log: (s: string, lvl?: LogLvls) => void;
  private output_buffer: string = '';
  private v86Instance: V86 | null = null;

  // Добавим в класс V86Module поле для хранения соответствия путей и inode
  private pathToInode: Map<string, number> = new Map();
  private rootInode: number | null = null;

  constructor(
    config: V86Config,
    fileSystem: FileSystemAPI,
    _sendPacket: (packet: Packet, inter: number) => void,
    sendEvent: EventFromMachineFunction
  ) {
    this.config = config;
    this.fileSystem = fileSystem;
    //this.sendPacketCallback = sendPacket;
    this.log = (log, lvl = 'info') => sendEvent('log', { log, lvl });
  }

  async start(): Promise<void> {
    this.v86Instance = new V86({
      disable_keyboard: true,
      disable_mouse: true,
      wasm_path: 'https://dimathenekov.github.io/AlpineLinuxBuilder/v86.wasm',
      memory_size: this.config.memory * 1024 * 1024,
      vga_memory_size: 8 * 1024 * 1024,
      bios: {
        url: 'https://dimathenekov.github.io/AlpineLinuxBuilder/seabios.bin',
      },
      vga_bios: {
        url: 'https://dimathenekov.github.io/AlpineLinuxBuilder/vgabios.bin',
      },
      filesystem: {
        baseurl:
          'https://dimathenekov.github.io/AlpineLinuxBuilder/alpine-rootfs-flat',
        basefs:
          'https://dimathenekov.github.io/AlpineLinuxBuilder/alpine-fs.json',
      },
      net_device: {
        type: 'virtio',
        relay_url: 'fetch',
      },
      disable_speaker: true,
      autostart: true,
      bzimage_initrd_from_filesystem: true,
      cmdline:
        'rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable',
      initial_state: {
        url: 'https://dimathenekov.github.io/AlpineLinuxBuilder/alpine-state.bin.zst',
      },
    });
    this.log('V86 module initialized');

    let timer = 0;
    this.v86Instance.add_listener('serial0-output-byte', (byte: number) => {
      this.output_buffer += String.fromCharCode(byte);
      if (this.output_buffer.endsWith('\n')) {
        this.log(this.output_buffer);
        this.output_buffer = '';
        if (timer) {
          clearTimeout(timer);
          timer = 0;
        }
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = 0;
        this.log(this.output_buffer);
        this.output_buffer = '';
      }, 1000);
    });
    console.log(this.v86Instance);
    await new Promise(r =>
      this.v86Instance!.add_listener('emulator-started', r)
    );
    console.log(this.v86Instance);
    /*this.v86Instance.add_listener('net0-send', (p: Uint8Array) => {
      try {
        const packet = parse_eth(p);
        console.log('V86 send', packet);
        this.sendPacketCallback(packet, 0);
      } catch (e) {
        console.log(e);
      }
    });
    this.v86Instance.serial0_send(
      'ip link set dev eth0 address ' +
        this.config.mac +
        '; ip link set eth0 up; ifconfig eth0 ' +
        this.config.ip.join('.') +
        ' netmask 255.255.255.0 broadcast 192.168.1.255\n'
    );*/
    this.v86Instance.serial0_send(
      'ip link set eth0 up && udhcpc -i eth0 && npm config set registry http://registry.npmjs.org/\n'
    );
    while (!this.output_buffer.includes(':~# ')) {
      await new Promise(r => setTimeout(r, 1000));
    }

    this.initFileSystem('/root/proj', '/');
    this.fileSystem.addEventListener(this.handleFileEvent);

    this.log('V86 machine started');
  }

  async stop(): Promise<void> {
    this.fileSystem.removeEventListener(this.handleFileEvent);
    if (this.v86Instance) {
      await this.v86Instance.stop();
      this.log('V86 machine stopped');
    }
  }

  /**
   * Инициализирует файловую систему: создаёт inode для директории mountPath
   * и рекурсивно для всего её содержимого из FileSystemAPI.
   * @param mountPath - путь в гостевой FS, куда монтируем (например, '/root/proj')
   */
  async initFileSystem(mountPath: string, FSAPath: string): Promise<void> {
    //debugger;
    const fs9p = this.v86Instance?.fs9p;
    if (!fs9p) {
      throw new Error('fs9p not available');
    }

    // Корневая директория в гостевой системе обычно inode 0 или 1
    // Найдём inode корня (предположим, что это первый элемент в массиве inodes)
    // В v86 корень часто имеет inode 1, но проверим по наличию direntries
    let rootInode: number | undefined;
    for (let i = 0; i < fs9p.inodes.length; i++) {
      const inode = fs9p.inodes[i];
      if (inode && inode.direntries && inode.direntries.size > 2) {
        rootInode = i;
        break;
      }
    }
    if (rootInode === undefined) {
      // Если не нашли, считаем что корень - inode 0
      rootInode = 0;
    }

    // Создаём целевую директорию mountPath (разбиваем путь)
    const parts = mountPath.split('/').filter(p => p.length > 0);
    let currentInode = rootInode;
    let currentPath = '';

    for (const part of parts) {
      currentPath += '/' + part;
      const dirInode = fs9p.inodes[currentInode];
      if (!dirInode) throw new Error(`Path component ${currentPath} not found`);
      const rdi = dirInode.direntries.get(part);
      // Проверяем, есть ли уже такая поддиректория
      if (rdi !== undefined) {
        // Уже существует, переходим в неё
        currentInode = rdi;
        continue;
      }

      // Создаём новую директорию
      const newInode = this.createInode('directory', currentPath);
      // Добавляем в direntries родителя
      dirInode.direntries.set(part, newInode);
      currentInode = newInode;
    }

    this.rootInode = currentInode;
    this.pathToInode.clear();
    this.pathToInode.set(FSAPath, this.rootInode);

    // Рекурсивно добавляем содержимое из FileSystemAPI
    await this.syncDirectory(FSAPath, this.rootInode);
  }

  /**
   * Создаёт новый inode в fs9p.
   * @param type 'file' или 'directory'
   * @param path полный путь (для логов, необязательно)
   * @param content для файла - Uint8Array, для директории - null
   * @returns номер созданного inode
   */
  private createInode(
    type: 'file' | 'directory',
    path?: string,
    content?: Uint8Array
  ): number {
    console.log(path);
    const fs9p = this.v86Instance!.fs9p;
    const qidcounter = fs9p.qidcounter;
    const newId = ++qidcounter.last_qidnumber;

    const now = Math.floor(Date.now() / 1000);
    const isDir = type === 'directory';
    const mode = isDir ? 16877 : 33188; // 040755 и 0100644
    const qidType = isDir ? 0x80 : 0; // для директорий ставим флаг QTDIR

    const newInode: any = {
      atime: now,
      ctime: now,
      direntries: isDir ? new Map<string, number>() : undefined,
      fid: newId,
      foreign_id: -1,
      gid: 0,
      locks: [],
      major: 0,
      minor: 0,
      mode: mode,
      mount_id: -1,
      mtime: now,
      nlinks: isDir ? 2 : 1, // для директории обычно 2 + число поддиректорий
      qid: {
        type: qidType,
        version: 0,
        path: newId + 1,
      },
      sha256sum: '',
      size: isDir ? 0 : content ? content.length : 0,
      status: 0,
      symlink: '',
      uid: 0,
    };

    fs9p.inodes[newId] = newInode;
    if (content) {
      fs9p.inodedata[newId] = content;
    } else if (!isDir) {
      fs9p.inodedata[newId] = new Uint8Array(0);
    }

    return newId;
  }

  /**
   * Рекурсивно синхронизирует директорию из FileSystemAPI с inode в v86.
   * @param fsPath путь в FileSystemAPI (например, "/root/proj")
   * @param parentInode номер inode родительской директории в v86
   */
  private async syncDirectory(
    FSAPath: string,
    parentInode: number
  ): Promise<void> {
    const entries = this.fileSystem.readDir(FSAPath);
    const parent = this.v86Instance!.fs9p.inodes[parentInode];
    if (!parent) throw new Error(`Parent inode ${parentInode} not found`);

    for (const entry of entries) {
      const fullPath =
        FSAPath === '/' ? '/' + entry.name : FSAPath + '/' + entry.name;
      const existingInode = parent.direntries.get(entry.name);
      if (existingInode !== undefined) {
        // Уже есть, просто обновляем путь в маппинге
        this.pathToInode.set(fullPath, existingInode);
        if (entry.type === 'directory') {
          await this.syncDirectory(fullPath, existingInode);
        }
        continue;
      }

      if (entry.type === 'file') {
        const content = await this.fileSystem.readFile(fullPath);
        const newInode = this.createInode('file', fullPath, content);
        parent.direntries.set(entry.name, newInode);
        this.pathToInode.set(fullPath, newInode);
      } else {
        const newInode = this.createInode('directory', fullPath);
        parent.direntries.set(entry.name, newInode);
        this.pathToInode.set(fullPath, newInode);
        await this.syncDirectory(fullPath, newInode);
      }
    }
  }

  /**
   * Обрабатывает события файловой системы (create, delete, edit)
   * и синхронизирует их с v86.
   */
  handleFileEvent(event: FSEvent): void {
    const fs9p = this.v86Instance?.fs9p;
    if (!fs9p) return;

    switch (event.type) {
      case 'create': {
        // Создание файла или директории
        const { path, entry_type } = event;
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1);

        const parentInode = this.pathToInode.get(parentPath);
        if (!parentInode) {
          console.warn(
            `Parent directory ${parentPath} not found in mapping, cannot create ${path}`
          );
          return;
        }

        const parent = fs9p.inodes[parentInode];
        if (!parent) {
          console.warn(`Parent inode ${parentInode} not found`);
          return;
        }

        // Проверяем, не существует ли уже
        if (parent.direntries.get(name) !== undefined) {
          // Уже есть, возможно перезапись? Игнорируем
          return;
        }

        let newInode: number;
        if (entry_type === 'file') {
          // Для файла нужно прочитать содержимое (но событие create не передаёт содержимое)
          // Возможно, содержимое будет позже через edit, поэтому создаём пустой файл
          this.fileSystem
            .readFile(path)
            .then(content => {
              // Если файл уже создан, обновим содержимое
              const inodeNum = this.pathToInode.get(path);
              if (inodeNum) {
                fs9p.inodedata[inodeNum] = content;
                const inode = fs9p.inodes[inodeNum];
                if (inode) {
                  inode.size = content.length;
                  inode.mtime = Math.floor(Date.now() / 1000);
                }
              }
            })
            .catch(() => {
              // Если файл не читается (пустой?), создаём пустой Uint8Array
              const content = new Uint8Array(0);
              const inodeNum = this.pathToInode.get(path);
              if (inodeNum) {
                fs9p.inodedata[inodeNum] = content;
              }
            });
          newInode = this.createInode('file', path, new Uint8Array(0));
        } else {
          newInode = this.createInode('directory', path);
        }

        parent.direntries.set(name, newInode);
        this.pathToInode.set(path, newInode);
        break;
      }

      case 'delete': {
        const { path /*, entry_type*/ } = event;
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
        const name = path.substring(path.lastIndexOf('/') + 1);

        const inodeNum = this.pathToInode.get(path);
        if (!inodeNum) {
          console.warn(`Path ${path} not found in mapping, cannot delete`);
          return;
        }

        // Рекурсивно удаляем все дочерние inode (для директории)
        const deleteRecursive = (inode: number) => {
          const node = fs9p.inodes[inode];
          if (!node) return;
          if (node.direntries) {
            // Это директория, удаляем всё содержимое
            for (const [_childName, childInode] of node.direntries.entries()) {
              deleteRecursive(childInode as number);
            }
          }
          delete fs9p.inodes[inode];
          delete fs9p.inodedata[inode];
          // Удаляем из pathToInode все пути, начинающиеся с удаляемого
          for (const [p, ino] of this.pathToInode) {
            if (ino === inode) {
              this.pathToInode.delete(p);
            }
          }
        };

        deleteRecursive(inodeNum);

        // Удаляем запись из родительской директории
        const parentInode = this.pathToInode.get(parentPath);
        if (parentInode) {
          const parent = fs9p.inodes[parentInode];
          if (parent && parent.direntries) {
            parent.direntries.delete(name);
          }
        }
        break;
      }

      case 'edit': {
        const { filename, content } = event;
        const inodeNum = this.pathToInode.get(filename);
        if (!inodeNum) {
          console.warn(`File ${filename} not found in mapping, cannot edit`);
          return;
        }

        const inode = fs9p.inodes[inodeNum];
        if (!inode) {
          console.warn(`Inode ${inodeNum} not found`);
          return;
        }

        // Обновляем содержимое и метаданные
        fs9p.inodedata[inodeNum] = content;
        inode.size = content.length;
        inode.mtime = Math.floor(Date.now() / 1000);
        break;
      }
    }
  }

  handlePacket(packet: Packet): void {
    //if(JSON.stringify(parse_eth(build_eth(packet))) != JSON.stringify(packet)) {
    //  console.error(JSON.stringify(parse_eth(build_eth(packet))), '!=', JSON.stringify(packet));
    //}

    console.log(`Received packet: `, packet);
    const eth = build_eth(packet);
    console.log(`Received packet2: `, eth);
    //this.log(`Received packet: ${JSON.stringify(packet)}`);
    //this.log(`Received packet: ${eth.join(',')}`);

    this.v86Instance!.v86.cpu.bus.listeners['net0-receive'][0].fn(eth);
  }

  handleEvent<T extends keyof EventMapToMachine>(
    type: T,
    data: EventMapToMachine[T]['payload']
  ): EventMapToMachine[T]['result'] {
    if (!this.v86Instance) return;
    switch (type) {
      case 'send_input':
        if (data == '^C') this.v86Instance.serial0_send('\u0003');
        else this.v86Instance.serial0_send(data + '\n');
        //this.v86Instance!.keyboard_send_text(data);
        this.log(`Sent input: ${data}`);
        return;
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }
}
