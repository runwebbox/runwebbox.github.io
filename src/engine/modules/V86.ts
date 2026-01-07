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

export default class V86Module implements MachineModule {
  private config: V86Config;
  //private fileSystem: FileSystemAPI;
  //private sendPacketCallback: (packet: Packet) => void;
  private log: (s: string, lvl?: LogLvls) => void;
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
        relay_url: 'fetch',
        type: 'virtio',
        router_ip: '192.168.86.1',
        vm_ip: this.config.ip.join('.'),
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
    this.v86Instance.run();
    //this.v86Instance.add_listener("net0-send", (data: Uint8Array) => TODO this.sendPacketCallback({}) );
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
    switch (type) {
      case 'send_input':
        this.v86Instance!.keyboard_send_text(data);
        this.log(`Sent input: ${data}`);
        return;
      default:
        throw new Error(`Unknown event type: ${type}`);
    }
  }
}
