import type {
  WebBoxConfig,
  PipelineConnection,
  anyMachineConfig,
} from '../types/webBoxConfig';
import type { Packet } from './packet';
import type {
  MachineModule,
  EventFromMachineFunction,
  EventMapToMachine,
  EventMapFromMachine,
} from './modules/MachineModule.ts';
import { createFileSystemAPI } from './fileSystemAPI.ts';
import type { FileSystemAPI } from './fileSystem.ts';
import type { logMessage, EngineEvent, LogLvls, EngineStatus } from './log.ts';
import type { DeepReadonly } from '../loader/types.ts';

type MachineType = 'V86' | 'internet' | 'static_server' | 'browser';

interface MachineInstance {
  id: number;
  module: MachineModule;
  config: anyMachineConfig;
  type: MachineType;
  logs: logMessage[];
}

export class Engine {
  private config: WebBoxConfig;
  private machines: Map<number, MachineInstance> = new Map();
  private pipelines: PipelineConnection[] = [];
  private status: EngineStatus = 'stopped';
  private fileSystemAPI: FileSystemAPI;
  private logs: logMessage[] = [];
  private UID: string;
  private eventListeners: Set<(event: EngineEvent) => void> = new Set();

  constructor(config: WebBoxConfig) {
    this.config = config;
    this.fileSystemAPI = createFileSystemAPI(config.file_system);
    this.pipelines = config.config.pipelines;
    this.UID = crypto.randomUUID();
    setTimeout(() => {
      this.start();
    }, 1000);
  }

  public addEventListener(f: (event: EngineEvent) => void) {
    this.eventListeners.add(f);
  }

  public removeEventListener(f: (event: EngineEvent) => void) {
    this.eventListeners.delete(f);
  }

  private emitEvent(event: EngineEvent) {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('Event listener error:', err);
      }
    }
  }

  private machineHandleEvent<K extends keyof EventMapFromMachine>(
    id: number,
    type: K,
    data: EventMapFromMachine[K]['payload']
  ) {
    const machine = this.machines.get(id);
    if (!machine) {
      throw new Error(`Machine ${id} not found`);
    }
    switch (type) {
      case 'log': {
        const logEntry = {
          lvl: data.lvl,
          log: `[${new Date().toISOString()}] ${data.log}`,
        };
        machine.logs.push(logEntry);
        while (machine.logs.length > 100) machine.logs.shift();
        this.emitEvent({
          id,
          type: 'message',
          logs: machine.logs,
        });
      }
    }
  }

  private async loadMachineModule(
    config: anyMachineConfig,
    fileSystem: FileSystemAPI,
    sendPacket: (packet: Packet, port: number) => void,
    sendEvent: EventFromMachineFunction
  ): Promise<MachineModule> {
    switch (config.type) {
      case 'V86': {
        const V86Module = await import('./modules/MMV86.ts');
        return new V86Module.default(config, fileSystem, sendPacket, sendEvent);
      }
      //case 'internet':
      //  const networkModule = await import('./modules/network');
      //  return networkModule.default;
      case 'static_server': {
        const staticServerModule = await import('./modules/MMStaticServer.ts');
        return new staticServerModule.default(
          config,
          fileSystem,
          sendPacket,
          sendEvent
        );
      }
      case 'browser': {
        const browserModule = await import('./modules/MMBrowser.ts');
        return new browserModule.default(config, sendPacket, sendEvent);
      }
      default:
        throw new Error(`Unknown machine type: ${config.type}`);
    }
  }

  private createSendPacketCallback(
    machineId: number
  ): (packet: Packet, port: number) => Promise<void> {
    return async (packet: Packet, port: number) => {
      if (this.status != 'running') return;

      // Добавляем временную метку
      //packet.timestamp = Date.now();

      // Находим связанные машины через пайплайны
      const connections = this.pipelines.filter(
        p =>
          (p.source_id === machineId && p.source_port == port) ||
          (p.destination_id === machineId && p.destination_port == port)
      );

      for (const connection of connections) {
        const targetId =
          connection.source_id === machineId
            ? connection.destination_id
            : connection.source_id;
        const targetPort =
          connection.source_id === machineId
            ? connection.destination_port
            : connection.source_port;

        const targetMachine = this.machines.get(targetId);
        if (targetMachine) {
          try {
            targetMachine.module.handlePacket(packet, targetPort);
          } catch (error) {
            console.error(`Error in machine ${targetId}: ${error}`, 'error');
            this.log(`Error in machine ${targetId}: ${error}`, 'error');
          }
        }
      }
    };
  }

  async start(): Promise<void> {
    if (!['stopped', 'error'].includes(this.status)) {
      throw new Error('Engine is already running');
    }
    this.status = 'starting';
    this.emitEvent({ type: 'status_update', data: this.status });

    this.log(`Starting engine at ${new Date().toISOString()}`);

    // Инициализируем все машины
    for (const machineConfig of this.config.config.machines) {
      try {
        this.log(`Loading machine ${machineConfig.id} (${machineConfig.type})`);

        const sendPacket = this.createSendPacketCallback(machineConfig.id);
        const moduleInstance = await this.loadMachineModule(
          machineConfig,
          this.fileSystemAPI,
          sendPacket,
          this.machineHandleEvent.bind(this, machineConfig.id)
        );

        this.machines.set(machineConfig.id, {
          id: machineConfig.id,
          module: moduleInstance,
          config: machineConfig,
          type: machineConfig.type,
          logs: [],
        });

        this.log(`Machine ${machineConfig.id} initialized successfully`);
      } catch (error) {
        this.log(
          `Failed to initialize machine ${machineConfig.id}: ${error}`,
          'error'
        );
      }
    }

    // Запускаем все машины
    for (const [id, machine] of this.machines) {
      try {
        await machine.module.start();
        await new Promise(r => setTimeout(r, 100));
        this.log(`Machine ${id} started`);
      } catch (error) {
        this.log(`Failed to start machine ${id}: ${error}`, 'error');
      }
    }
    await new Promise(r => setTimeout(r, 100));

    this.status = 'running';
    this.emitEvent({ type: 'status_update', data: this.status });
    this.log('Engine started successfully');
  }

  async stop(): Promise<void> {
    if (this.status != 'running') {
      return;
    }

    this.status = 'stopping';
    this.emitEvent({ type: 'status_update', data: this.status });

    this.log('Stopping engine...');

    // Останавливаем все машины в обратном порядке
    const machinesArray = Array.from(this.machines.values()).reverse();

    for (const machine of machinesArray) {
      try {
        await machine.module.stop();
        await new Promise(r => setTimeout(r, 100));
        this.log(`Machine ${machine.id} stopped`);
      } catch (error) {
        this.log(`Error stopping machine ${machine.id}: ${error}`, 'error');
      }
    }
    await new Promise(r => setTimeout(r, 100));

    this.machines.clear();
    this.status = 'stopped';
    this.emitEvent({ type: 'status_update', data: this.status });
    this.log('==================');
  }

  getMachineLogs(machineId: number): logMessage[] | null {
    if (machineId < 0) return this.getLogs();
    const machine = this.machines.get(machineId);
    if (!machine) {
      return null;
    }

    return machine.logs;
  }

  getUID() {
    return this.UID;
  }

  getFileSystemAPI() {
    return this.fileSystemAPI;
  }

  getLogs(): logMessage[] {
    return this.logs;
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  getConfig(): DeepReadonly<WebBoxConfig['config']> {
    return this.config.config;
  }

  private log(s: string, lvl: LogLvls = 'info') {
    const logEntry = { log: `[${new Date().toISOString()}] ${s}`, lvl };
    this.logs.push(logEntry);
    while (this.logs.length > 1000) this.logs.shift();

    this.emitEvent({
      id: -1,
      type: 'message',
      logs: this.logs,
    });
  }

  getMachineInfo(machineId: number) {
    const machine = this.machines.get(machineId);
    if (!machine) {
      return null;
    }

    return {
      id: machine.id,
      type: machine.type,
      config: machine.config,
      logs: machine.logs,
    };
  }

  async sendEventToMachine(
    machineId: number,
    type: keyof EventMapToMachine,
    data: string
  ): Promise<void> {
    const machine = this.machines.get(machineId);
    if (!machine) {
      throw new Error(`Machine ${machineId} not found`);
    }
    machine.module.handleEvent(type, data);
  }
}
