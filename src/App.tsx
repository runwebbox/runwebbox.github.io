import React from 'react';
import { Provider } from 'react-redux';
import { store } from './store/store';
import LeftSidebar from './components/LeftSidebar';
import EditorArea from './components/EditorArea';
import BrowserPreview from './components/BrowserPreview';
import { Engine } from './engine/engine';
import TabManager from './components/TabManager';
import { EngineProvider } from './providers/EngineProvider';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { EngineControl } from './components/EngineControl';

interface AppProps {
  engine: Engine;
}

const App: React.FC<AppProps> = (props: AppProps) => {
  return (
    <Provider store={store}>
      <EngineProvider engine={props.engine}>
        <div className="h-screen flex flex-col bg-zinc-900 text-white">
          <div className="flex-1 overflow-hidden">
            <PanelGroup direction="horizontal" className="h-full">
              <Panel
                defaultSize={20}
                minSize={15}
                className="bg-zinc-900 h-full flex flex-col"
              >
                <LeftSidebar />
                <EngineControl />
              </Panel>

              <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />

              <Panel defaultSize={40} minSize={30} className="flex flex-col">
                <TabManager />
                <div className="flex-1 overflow-auto">
                  <EditorArea />
                </div>
              </Panel>

              <PanelResizeHandle className="w-1 bg-zinc-800 hover:bg-zinc-700 transition-colors" />
              <Panel defaultSize={40} minSize={30} className="bg-zinc-900">
                <BrowserPreview />
              </Panel>
            </PanelGroup>
          </div>
        </div>
      </EngineProvider>
    </Provider>
  );
};

export default App;
