import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useFileSystem } from '../hooks/useFileSystem';
import useEngine from '../hooks/useEngine';

const EditorArea: React.FC = () => {
  const { activeTab } = useFileSystem();
  const Engine = useEngine();
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadFileContent = async () => {
      if (!activeTab) {
        setContent('');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const fileContent = await Engine.getFileSystemAPI().readFile(activeTab);
        const decodedContent = new TextDecoder('utf-8').decode(fileContent);
        setContent(decodedContent);
      } catch (error) {
        console.error('Error reading file:', error);
        setContent('');
      } finally {
        setIsLoading(false);
      }
    };

    loadFileContent();
  }, [activeTab, Engine]);

  const handleEditorChange = async (value: string | undefined) => {
    if (value !== undefined && activeTab) {
      try {
        await Engine.getFileSystemAPI().writeFile(
          activeTab,
          new TextEncoder().encode(value)
        );
        setContent(value); // Update local state
      } catch (error) {
        console.error('Error writing file:', error);
      }
    }
  };

  const getLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const languages: { [key: string]: string } = {
      js: 'javascript',
      ts: 'typescript',
      jsx: 'javascript',
      tsx: 'typescript',
      html: 'html',
      css: 'css',
      json: 'json',
      md: 'markdown',
      py: 'python',
      java: 'java',
      php: 'php',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      rb: 'ruby',
      go: 'go',
      rs: 'rust',
      sql: 'sql',
      xml: 'xml',
      yaml: 'yaml',
      yml: 'yaml',
    };
    return languages[ext] || 'plaintext';
  };

  if (!activeTab) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        Select a file to edit
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className="bg-zinc-800 px-4 py-2 border-b border-zinc-700">
        <h3 className="font-medium">{activeTab}</h3>
      </div>
      <Editor
        height="calc(100% - 33px)"
        language={getLanguage(activeTab)}
        value={content}
        onChange={handleEditorChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: true },
          fontSize: 14,
          automaticLayout: true,
        }}
      />
    </div>
  );
};

export default EditorArea;
