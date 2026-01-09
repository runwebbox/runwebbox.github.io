import {
  isFSDirectory,
  isFSFile,
  type FSEntry,
  type FSFile,
} from '../engine/fileSystem';
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
        new TextDecoder().decode(configFile.content) || '{}'
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
function findConfigFile(fileSystem: FSEntry): FSFile | null {
  function searchFiles(items: FSEntry[]): FSFile | null {
    for (const item of items) {
      if (isFSFile(item) && item.name === 'WebBoxConfig.json') {
        return item;
      }
      if (isFSDirectory(item) && item.content) {
        const found = searchFiles(item.content);
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

function randomMac() {
  return '0X:XX:XX:XX:XX:XX'.replace(/X/g, () =>
    '0123456789ABCDEF'.charAt(Math.floor(Math.random() * 16))
  );
}

// Helper function to create default configuration
function createDefaultConfig(fileSystem: FSEntry): WebBoxConfig {
  return {
    version: '1.0.0',
    file_system: fileSystem,
    config: {
      machines: [
        {
          type: 'browser',
          id: 0,
          ip: [192, 168, 1, 100],
          url: '192.168.1.1/',
          mac: randomMac(),
        },
        {
          type: 'static_server',
          id: 1,
          ip: [192, 168, 1, 1],
          mac: randomMac(),
          path: '/',
          showDirectoryListing: true,
        },
        {
          type: 'V86',
          id: 2,
          ip: [192, 168, 1, 50],
          mac: randomMac(),
          path: '/',
          memory: 512,
        },
      ],
      pipelines: [
        {
          source_id: 0,
          source_port: 0,
          destination_id: 1,
          destination_port: 0,
        },
        {
          source_id: 0,
          source_port: 0,
          destination_id: 2,
          destination_port: 0,
        },
        {
          source_id: 1,
          source_port: 0,
          destination_id: 2,
          destination_port: 0,
        },
      ],
      default_browser: 0,
    },
  };
}
