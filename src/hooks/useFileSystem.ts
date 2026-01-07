import { useAppSelector, useAppDispatch } from './redux';
//import { V86 } from 'v86';
import {
  openFile,
  closeTab,
  setActiveTab,
} from '../store/slices/fileSystemSlice';

export const useFileSystem = () => {
  //console.log(V86);
  const dispatch = useAppDispatch();
  const { openTabs, activeTab, currentProject } = useAppSelector(
    state => state.fileSystem
  );

  const handleOpenFile = (fileId: string) => {
    dispatch(openFile(fileId));
  };

  const handleCloseTab = (fileId: string) => {
    dispatch(closeTab(fileId));
  };

  const handleSetActiveTab = (fileId: string) => {
    dispatch(setActiveTab(fileId));
  };

  return {
    openTabs,
    activeTab,
    currentProject,
    openFile: handleOpenFile,
    closeTab: handleCloseTab,
    setActiveTab: handleSetActiveTab,
  };
};
