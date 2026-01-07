import React from 'react';
import type { Engine } from '../engine/engine';
import { EngineContext } from '../contexts/EngineContext';

export const EngineProvider: React.FC<{
  engine: Engine;
  children: React.ReactNode;
}> = ({ engine, children }) => {
  return (
    <EngineContext.Provider value={engine}>{children}</EngineContext.Provider>
  );
};
