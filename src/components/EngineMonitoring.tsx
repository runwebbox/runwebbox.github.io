// EngineMonitoring.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import {
  setSelectedTab,
  type MonitoringState,
} from '../store/slices/monitoringSlice';
import useEngine from '../hooks/useEngine';
import type { EngineEvent } from '../engine/log';
import type { anyMachineConfig } from '../types/webBoxConfig';
import type { DeepReadonly } from '../loader/types';
import LogsTab from './MonitoringTabs/LogsTab';
import BrowserTab from './MonitoringTabs/BrowserTab';
import NetworkTab from './MonitoringTabs/NetworkTab';

type tab = {
  info: MonitoringState;
  text: string;
};

const EngineMonitoring: React.FC = () => {
  const engine = useEngine();
  const dispatch = useAppDispatch();
  const selectedTab = useAppSelector(state => state.monitoring);

  const [machines, setMachines] = useState<DeepReadonly<anyMachineConfig[]>>(
    () => engine.getConfig().machines
  );

  const tabs = useMemo((): tab[] => {
    const numerator = new Map<string, number>();
    function returnNumber(s: string) {
      numerator.set(s, (numerator.get(s) || 0) + 1);
      return (numerator.get(s) || 1) >= 2 ? ' №' + numerator.get(s) : '';
    }
    return [
      {
        info: { selectedTab: 'network' },
        text: 'Network',
      },
      {
        info: { selectedTab: 'logs', selectedMachineId: -1 },
        text: 'Engine logs',
      },
      ...machines.flatMap((machine): tab[] => {
        switch (machine.type) {
          case 'V86':
          case 'static_server':
            return [
              {
                info: { selectedTab: 'logs', selectedMachineId: machine.id },
                text: `Server${returnNumber('server')} logs`,
              },
            ];
          case 'browser': {
            const n = returnNumber('browser');
            return [
              {
                info: { selectedTab: 'logs', selectedMachineId: machine.id },
                text: `Browser${n} logs`,
              },
              {
                info: { selectedTab: 'browser', selectedMachineId: machine.id },
                text: `Browser${n} iframe`,
              },
            ];
          }
          case 'internet':
            return [
              {
                info: { selectedTab: 'logs', selectedMachineId: machine.id },
                text: 'Internet' + returnNumber('server'),
              },
            ];
        }
      }),
    ];
  }, [machines]);

  useEffect(() => {
    const handleEngineEvent = (event: EngineEvent) => {
      if (event.type == 'config_update') {
        try {
          setMachines(engine.getConfig().machines);
        } catch (error) {
          console.error('Failed to get machine logs:', error);
        }
      }
    };

    engine.addEventListener(handleEngineEvent);
    return () => {
      engine.removeEventListener(handleEngineEvent);
    };
  }, [engine]);

  const handleTabChange = (tab: MonitoringState) => {
    dispatch(setSelectedTab(tab));
  };

  const renderTabContent = () => {
    switch (selectedTab.selectedTab) {
      case 'logs':
        return <LogsTab machineId={selectedTab.selectedMachineId} />;
      case 'browser':
        return <BrowserTab machineId={selectedTab.selectedMachineId} />;
      case 'network':
        return <NetworkTab />;
      default:
        return null;
    }
  };

  function isSelectedTab(tab: MonitoringState): boolean {
    if (tab.selectedTab == 'network')
      return tab.selectedTab == selectedTab.selectedTab;
    return (
      tab.selectedTab == selectedTab.selectedTab &&
      tab.selectedMachineId == selectedTab.selectedMachineId
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="bg-zinc-800 border-b border-zinc-700">
        <div className="flex">
          {tabs.map(tab => (
            <button
              onClick={() => handleTabChange(tab.info)}
              key={
                tab.info.selectedTab +
                '|' +
                (tab.info.selectedTab != 'network'
                  ? tab.info.selectedMachineId
                  : '')
              }
              className={`px-6 py-3 font-medium ${
                isSelectedTab(tab.info)
                  ? 'text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.text}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderTabContent()}</div>
    </div>
  );
};

export default EngineMonitoring;
