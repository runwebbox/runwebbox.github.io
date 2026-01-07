import { createContext } from 'react';
import type { Engine } from '../engine/engine';

export const EngineContext = createContext<Engine | undefined>(undefined);
