import { useContext } from 'react';
import { EngineContext } from '../contexts/EngineContext';

export default () => {
  const context = useContext(EngineContext);
  if (context === undefined) {
    throw new Error('useEngine must be used within a V86InstanceProvider');
  }
  return context;
};
