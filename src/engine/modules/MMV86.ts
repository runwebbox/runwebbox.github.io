import type {
  EventFromMachineFunction,
  EventMapToMachine,
  MachineModule,
} from './MachineModule';
import { type Packet } from '../packet';
import type { FileSystemAPI } from '../fileSystem';
import { V86 } from 'v86';
import type { V86Config } from '../../types/webBoxConfig';
import type { LogLvls } from '../log';
import { parseparse_eth } from '../TCPParser';

export default class V86Module implements MachineModule {
  private config: V86Config;
  //private fileSystem: FileSystemAPI;
  //private sendPacketCallback: (packet: Packet) => void;
  private log: (s: string, lvl?: LogLvls) => void;
  private output_buffer: string = '';
  private v86Instance: V86 | null = null;
  constructor(
    config: V86Config,
    _fileSystem: FileSystemAPI,
    _sendPacket: (packet: Packet, port: number) => void,
    sendEvent: EventFromMachineFunction
  ) {
    this.config = config;
    //this.fileSystem = fileSystem;
    //this.sendPacketCallback = sendPacket;
    this.log = (log, lvl = 'info') => sendEvent('log', { log, lvl });
  }

  async start(): Promise<void> {
    this.v86Instance = new V86({
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
    this.v86Instance.add_listener('net0-send', (p: Uint8Array) => {
      try {
        console.log(parseparse_eth(p));
      } catch (e) {
        console.log(e);
      }
    });
    this.v86Instance.serial0_send('./networking.sh\n');

    while (!this.output_buffer.includes(':~# ')) {
      await new Promise(r => setTimeout(r, 1000));
    }

    this.log('V86 machine started');
  }

  async stop(): Promise<void> {
    if (this.v86Instance) {
      await this.v86Instance.stop();
      this.log('V86 machine stopped');
    }
  }

  handlePacket(packet: Packet): void {
    this.log(`Received packet: ${JSON.stringify(packet)}`);
  }

  handleEvent<T extends keyof EventMapToMachine>(
    type: T,
    data: EventMapToMachine[T]['payload']
  ): EventMapToMachine[T]['result'] {
    if (!this.v86Instance) return;
    switch (type) {
      case 'send_input':
        this.v86Instance.serial0_send(data + '\n');
        //this.v86Instance!.keyboard_send_text(data);
        this.log(`Sent input: ${data}`);
        return;
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }
}
