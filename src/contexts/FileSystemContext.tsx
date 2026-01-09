import { createContext, useContext, type ReactNode } from 'react';

export interface FileSystemContextType {
  openTabs: string[];
  closeTab: (id: string) => void;
  currentProject: string;
}

export const FileSystemContext = createContext<
  FileSystemContextType | undefined
>(undefined);

export const useFileSystem = () => {
  const context = useContext(FileSystemContext);
  if (!context) {
    throw new Error('useFileSystem must be used within a FileSystemProvider');
  }
  return context;
};

export interface FileSystemProviderProps {
  children: ReactNode;
}
