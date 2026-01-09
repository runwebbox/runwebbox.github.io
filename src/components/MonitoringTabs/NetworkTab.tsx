import React from 'react';
import useEngine from '../../hooks/useEngine';
import type { DeepReadonly } from '../../loader/types';
import type {
  anyMachineConfig,
  PipelineConnection,
} from '../../types/webBoxConfig';

const NetworkTab: React.FC = () => {
  const config = useEngine().getConfig();
  const machines = config.machines;
  const pipelines = config.pipelines;

  return (
    <div className="h-full p-4">
      <div className="mb-4">
        <h3 className="text-lg font-medium mb-2">Network Connections</h3>
        <p className="text-sm text-gray-400">
          Showing {pipelines.length} pipeline connections
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {pipelines.map((pipe, index) => {
          const sourceMachine = machines.find(m => m.id === pipe.source_id);
          const destMachine = machines.find(m => m.id === pipe.destination_id);

          return (
            <PipelineConnection
              key={index}
              sourceMachine={sourceMachine}
              destMachine={destMachine}
              pipe={pipe}
            />
          );
        })}
      </div>
    </div>
  );
};

interface PipelineConnectionProps {
  sourceMachine?: DeepReadonly<anyMachineConfig>;
  destMachine?: DeepReadonly<anyMachineConfig>;
  pipe: PipelineConnection;
}

const PipelineConnection: React.FC<PipelineConnectionProps> = ({
  sourceMachine,
  destMachine,
  pipe,
}) => {
  return (
    <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="font-medium">
            {sourceMachine?.type || 'Unknown'} ({pipe.source_id})
          </span>
          <span className="text-gray-400">Port {pipe.source_port}</span>
        </div>

        <div className="text-gray-400 mx-2">↔</div>

        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Port {pipe.destination_port}</span>
          <span className="font-medium">
            {destMachine?.type || 'Unknown'} ({pipe.destination_id})
          </span>
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        </div>
      </div>
    </div>
  );
};

export default NetworkTab;
