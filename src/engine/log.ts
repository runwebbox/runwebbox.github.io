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
  lvl: LogLvls;
  data: string;
}

interface EventStatusUpdate {
  type: 'status_update';
  data: EngineStatus;
}

export type EngineEvent = EventLog | EventStatusUpdate;
