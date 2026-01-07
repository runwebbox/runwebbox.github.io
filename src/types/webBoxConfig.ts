import type { FSEntry } from '../engine/fileSystem';
//import { type V86 } from 'v86';
//import type { network_event } from './network';

export interface machineConfig {
  id: number;
  mac: string;
  ip: [number, number, number, number];
}

export interface V86Config extends machineConfig {
  type: 'V86';
  path: string;
  memory: number;
}

export interface networkConfig extends machineConfig {
  type: 'internet';
  path?: string; // load from file, else fetch
  proxy?: string;
}

export interface staticServerConfig extends machineConfig {
  type: 'static_server';
  path: string; // load from file
  showDirectoryListing: boolean;
}

export interface browserConfig extends machineConfig {
  type: 'browser';
  url: string;
}

export type anyMachineConfig =
  | V86Config
  | networkConfig
  | staticServerConfig
  | browserConfig;

export type PipelineConnection = {
  source_id: number;
  source_port: number;
  destination_id: number;
  destination_port: number;
}; // аналог физического кабеля. Работает в две стороны
// порт в данном контексте это разъем. По умолчанию - 0

export interface WebBoxConfig {
  version: string;
  file_system: FSEntry;
  config: {
    machines: anyMachineConfig[];
    pipelines: PipelineConnection[];
    default_browser: number;
  };
}
/*
export interface network_listener {
  listen: (p: network_event) => void;
}

export interface V86_machine extends V86Config, network_listener {
  V86: V86;
}

export interface network_machine extends V86Config, network_listener {}

export interface browser_machine extends V86Config, network_listener {}
*/
