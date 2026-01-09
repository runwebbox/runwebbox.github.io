import type { WebBoxConfig } from '../types/webBoxConfig';

export type LogLvls = 'info' | 'warning' | 'error';

export interface logMessage {
  log: string;
  lvl: LogLvls;
}
export type EngineStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

export type MachineStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error';

interface EventLog {
  type: 'message';
  id: number; // -1 for system
  logs: logMessage[];
}

interface EventStatusUpdate {
  type: 'status_update';
  data: EngineStatus;
}

interface EventConfigUpdate {
  type: 'config_update';
  data: WebBoxConfig;
}

export type EngineEvent = EventLog | EventStatusUpdate | EventConfigUpdate;
