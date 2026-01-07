import React from 'react';
import { useFileSystem } from '../hooks/useFileSystem';
import useEngine from '../hooks/useEngine';

const TabManager: React.FC = () => {
  const { openTabs, activeTab, setActiveTab, closeTab } = useFileSystem();
  const Engine = useEngine();

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 flex">
      {openTabs.map(tabId => {
        const file = Engine.getFileSystemAPI().stat(tabId);
        if (!file) return null;

        return (
          <div
            key={tabId}
            className={`flex items-center px-3 py-2 border-r border-zinc-700 cursor-pointer ${
              activeTab === tabId
                ? 'bg-zinc-700'
                : 'bg-zinc-800 hover:bg-zinc-700'
            }`}
            onClick={() => setActiveTab(tabId)}
          >
            <span className="mr-2">
              {file.type === 'directory' ? '📁' : '📄'}
            </span>
            <span className="max-w-xs truncate">{file.name}</span>
            <button
              className="ml-2 text-zinc-400 hover:text-white"
              onClick={e => {
                e.stopPropagation();
                closeTab(tabId);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default TabManager;
