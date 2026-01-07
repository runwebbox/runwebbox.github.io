import { isFSDirectory, isFSFile, type FSEntry } from '../engine/fileSystem';
import type { FileItem } from '../types/fileSystem';
import type { WebBoxConfig } from '../types/webBoxConfig';

/*
    if config have WebBoxConfig.json file then
        upload this
        remove from files
    else
        create default
*/
export function exportWebBox(fileSystem: FSEntry): WebBoxConfig {
  // Check if there's a WebBoxConfig.json file in the file system
  const configFile = findConfigFile(fileSystem);

  if (configFile) {
    // Parse and use the uploaded config
    try {
      const uploadedConfig = JSON.parse(
        configFile.content || '{}'
      ) as WebBoxConfig;

      // Remove the config file from the file system
      const updatedFileSystem = removeConfigFile(fileSystem);

      // Merge the uploaded config with the current one, giving priority to uploaded config
      return {
        ...uploadedConfig,
        file_system: updatedFileSystem,
      };
    } catch (error) {
      console.error(
        'Failed to parse WebBoxConfig.json, using default config',
        error
      );
      return createDefaultConfig(fileSystem);
    }
  } else {
    // Create default config
    return createDefaultConfig(fileSystem);
  }
}

// Helper function to find WebBoxConfig.json in the file system
function findConfigFile(fileSystem: FSEntry): FSEntry | null {
  function searchFiles(items: FSEntry[]): FSEntry | null {
    for (const item of items) {
      if (item.type === 'file' && item.name === 'WebBoxConfig.json') {
        return item;
      }
      if (item.type === 'folder' && item.children) {
        const found = searchFiles(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  return searchFiles([fileSystem]);
}

// Helper function to remove WebBoxConfig.json from the file system
function removeConfigFile(fileSystem: FSEntry): FSEntry {
  function removeFromItems(items: FSEntry[]): FSEntry[] {
    return items.filter(item => {
      if (isFSFile(item) && item.name === 'WebBoxConfig.json') {
        return false; // Remove the config file
      }
      if (isFSDirectory(item)) {
        return {
          ...item,
          children: removeFromItems(item.content),
        };
      }
      return true;
    });
  }

  if (isFSFile(fileSystem)) {
    return {
      ...fileSystem,
      content: fileSystem.content,
    };
  }

  return {
    ...fileSystem,
    content: removeFromItems(fileSystem.content),
  };
}

// Helper function to create default configuration
function createDefaultConfig(fileSystem: FileItem): WebBoxConfig {
  return {
    version: '1.0.0',
    file_system: fileSystem,
    config: {
      machines: [
        {
          type: 'browser',
          id: 0,
          listeners: ['*'],
          ip: [192, 168, 1, 1],
          path: '/',
        },
      ],
      default_browser: 0,
    },
  };
}
