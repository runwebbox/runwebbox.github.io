import { configureStore } from '@reduxjs/toolkit';
import fileSystemReducer from './slices/fileSystemSlice';
import monitoring from './slices/monitoringSlice';

export const store = configureStore({
  reducer: {
    fileSystem: fileSystemReducer,
    monitoring: monitoring,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
