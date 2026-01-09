import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface FileSystemState {
  openTabs: string[];
  activeTab: string | null;
  currentProject: string;
}

const initialState: FileSystemState = {
  //fileSystem: initialFileSystem,
  openTabs: [],
  activeTab: null,
  currentProject: 'demo-project',
};

const fileSystemSlice = createSlice({
  name: 'fileSystem',
  initialState,
  reducers: {
    openFile: (state, action: PayloadAction<string>) => {
      const fileId = action.payload;

      // Добавляем вкладку, если её еще нет
      if (!state.openTabs.includes(fileId)) {
        state.openTabs.push(fileId);
      }

      // Устанавливаем активную вкладку
      state.activeTab = fileId;
    },

    closeTab: (state, action: PayloadAction<string>) => {
      const fileId = action.payload;
      state.openTabs = state.openTabs.filter(tabId => tabId !== fileId);

      // Если закрыли активную вкладку, выбираем следующую
      if (state.activeTab === fileId) {
        state.activeTab =
          state.openTabs.length > 0
            ? state.openTabs[state.openTabs.length - 1]
            : null;
      }
    },

    setActiveTab: (state, action: PayloadAction<string>) => {
      state.activeTab = action.payload;
    },
  },
});

export const { openFile, closeTab, setActiveTab } = fileSystemSlice.actions;

export default fileSystemSlice.reducer;
