import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type NetworkTab = { selectedTab: 'network' };
type LogsTab = { selectedTab: 'logs' | 'browser'; selectedMachineId: number };

export type MonitoringState = NetworkTab | LogsTab;

const initialState: MonitoringState = {
  selectedTab: 'logs' as MonitoringState['selectedTab'],
  selectedMachineId: -1,
};

const monitoringSlice = createSlice({
  name: 'monitoring',
  initialState,
  reducers: {
    setSelectedTab: (_, action: PayloadAction<MonitoringState>) => {
      // Type-safe approach with type narrowing
      if (action.payload.selectedTab === 'network') {
        return action.payload;
      } else {
        // Must be logs or browser with machineId
        return action.payload as LogsTab;
      }
    },
  },
});

export const { setSelectedTab } = monitoringSlice.actions;
export default monitoringSlice.reducer;
