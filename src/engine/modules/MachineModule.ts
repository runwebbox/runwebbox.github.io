import type { logMessage } from '../log';
import type { Packet } from '../packet';

export type EventMapToMachine = {
  send_input: {
    payload: string;
    result: void;
  };
  update_domain: {
    payload: string;
    result: void;
  };
};

export type EventToMachineFunction = <K extends keyof EventMapToMachine>(
  type: K,
  data: EventMapToMachine[K]['payload']
) => EventMapToMachine[K]['result'];

export type EventMapFromMachine = {
  log: {
    payload: logMessage;
    result: void;
  };
};

export type EventFromMachineFunction = <K extends keyof EventMapFromMachine>(
  type: K,
  data: EventMapFromMachine[K]['payload']
) => EventMapFromMachine[K]['result'];

export interface MachineModule {
  // Запуск машины
  start(): Promise<void>;

  // Остановка машины
  stop(): Promise<void>;

  // Обработка входящего пакета
  handlePacket(packet: Packet, port: number): void;

  handleEvent: EventToMachineFunction;
}
