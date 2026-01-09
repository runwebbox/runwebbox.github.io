// components/LeftSidebar.tsx
import React, { useEffect, useReducer } from 'react';
import { useFileSystem } from '../hooks/useFileSystem';
import useEngine from '../hooks/useEngine';

const LeftSidebar: React.FC = () => {
  const { openFile } = useFileSystem();
  const Engine = useEngine();
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  const fsApi = Engine.getFileSystemAPI();

  useEffect(() => {
    fsApi.addEventListener(forceUpdate);
    return fsApi.removeEventListener.bind(undefined, forceUpdate);
  }, [fsApi]);

  const renderFileTree = (path: string, level = 0) => {
    return fsApi.readDir(path || '/').map(file => {
      const fullPath = path ? `${path}/${file.name}` : file.name;
      return (
        <div key={fullPath} className="select-none">
          <div
            className="flex items-center px-2 py-1 hover:bg-zinc-700 cursor-pointer"
            style={{ paddingLeft: `${level * 16 + 8}px` }}
            onClick={() => file.type === 'file' && openFile(fullPath)}
          >
            <span className="mr-2">
              {file.type === 'directory' ? '📁' : getFileIcon(file.name)}
            </span>
            <span>{file.name}</span>
          </div>
          {file.type === 'directory' && (
            <div className="ml-2">{renderFileTree(fullPath, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()!.toLowerCase();
    const icons: { [key: string]: string } = {
      js: '📄',
      ts: '📄',
      jsx: '⚛️',
      tsx: '⚛️',
      html: '🌐',
      css: '🎨',
      json: '📋',
      md: '📝',
    };
    return icons[ext] || '📄';
  };

  return (
    <div className="flex-grow overflow-y-auto">
      <div className="p-3 border-b border-zinc-700">
        <h2 className="font-semibold">Files</h2>
      </div>
      <div className="p-2">{renderFileTree('')}</div>
    </div>
  );
};

export default LeftSidebar;
