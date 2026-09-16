import { useState, useEffect } from 'react';
import './style.css';
import {
  GetSavedConnections,
  Connect,
  Disconnect,
  ExecuteQuery,
} from '../wailsjs/go/main/App';
import { types } from '../wailsjs/go/models';
import SchemaTree from './components/SchemaTree/SchemaTree';
import ConnectionDialog from './components/ConnectionDialog/ConnectionDialog';
import SqlEditor from './components/SqlEditor/SqlEditor';

interface Tab {
  id: string;
  title: string;
  query: string;
  result: types.QueryResult | null;
  error: string | null;
  connection: string | null;
}

let tabCounter = 0;

function createTab(connection: string | null = null): Tab {
  tabCounter++;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: `Query ${tabCounter}`,
    query: '',
    result: null,
    error: null,
    connection,
  };
}

function App() {
  const [connections, setConnections] = useState<types.ConnectionConfig[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const updateTab = (id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await GetSavedConnections();
      setConnections(conns || []);
    } catch (err) {
      console.error('Erro ao carregar conexoes:', err);
    }
  };

  const handleConnect = async (config: types.ConnectionConfig) => {
    try {
      await Connect(config);
      setActiveConnection(config.Name);
      updateTab(activeTabId, { connection: config.Name, error: null });
    } catch (err) {
      updateTab(activeTabId, { error: `Erro ao conectar: ${err}` });
    }
  };

  const handleDisconnect = async () => {
    if (activeConnection) {
      try {
        await Disconnect(activeConnection);
        setActiveConnection(null);
        setTabs((prev) =>
          prev.map((t) =>
            t.connection === activeConnection
              ? { ...t, connection: null, result: null }
              : t
          )
        );
      } catch (err) {
        updateTab(activeTabId, { error: `Erro ao desconectar: ${err}` });
      }
    }
  };

  const handleExecuteQuery = async (tabId?: string) => {
    const targetId = tabId || activeTabId;
    const tab = tabs.find((t) => t.id === targetId);
    if (!tab) return;

    const conn = tab.connection || activeConnection;
    if (!conn) {
      updateTab(targetId, { error: 'Nenhuma conexao ativa' });
      return;
    }

    if (!tab.query.trim()) {
      updateTab(targetId, { error: 'Digite uma query para executar' });
      return;
    }

    try {
      updateTab(targetId, { error: null });
      const res = await ExecuteQuery(conn, tab.query);
      updateTab(targetId, { result: res, error: null });
    } catch (err) {
      updateTab(targetId, { result: null, error: `Erro ao executar query: ${err}` });
    }
  };

  const handleTableSelect = (tableName: string) => {
    updateTab(activeTabId, { query: `SELECT * FROM ${tableName}` });
  };

  const handleNewTab = () => {
    const newTab = createTab(activeConnection);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (id: string) => {
    if (tabs.length === 1) return;
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1].id);
      }
      return next;
    });
  };

  return (
    <div className="h-screen flex flex-col bg-app-bg text-zinc-100 select-none">
      {/* Header */}
      <header className="h-9 bg-app-surface border-b border-app-border flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-accent-blue rounded flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">A</span>
          </div>
          <span className="font-semibold text-xs">The Amzg DB</span>
        </div>
        <div className="flex-1" />
        {activeConnection && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-green" />
            <span className="text-zinc-400 text-xs">{activeConnection}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 bg-app-surface border-r border-app-border flex flex-col shrink-0">
          <div className="h-9 px-2 flex items-center justify-between border-b border-app-border">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Database</span>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="w-5 h-5 rounded bg-app-elevated hover:bg-accent-blue/20 hover:text-accent-blue flex items-center justify-center text-zinc-400 transition-colors"
              title="Nova Conexao"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 1v10M1 6h10" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {connections.length === 0 ? (
              <div className="p-3 text-center">
                <p className="text-[11px] text-zinc-500">Nenhuma conexao</p>
                <button
                  onClick={() => setIsDialogOpen(true)}
                  className="mt-1 text-[11px] text-accent-blue hover:text-accent-blue/80"
                >
                  Criar primeira conexao
                </button>
              </div>
            ) : (
              <div className="py-1">
                {connections.map((conn) => (
                  <div key={conn.Name} className="group">
                    <button
                      onClick={() => handleConnect(conn)}
                      className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors text-[11px] ${
                        activeConnection === conn.Name
                          ? 'bg-accent-blue/10 text-white'
                          : 'hover:bg-app-hover text-zinc-300 hover:text-white'
                      }`}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: conn.Color || '#22c55e' }}
                      />
                      <span className="font-medium truncate">{conn.Name}</span>
                    </button>

                    {activeConnection === conn.Name && (
                      <div className="bg-app-bg/30 animate-fade-in">
                        <SchemaTree
                          connectionName={conn.Name}
                          onTableSelect={handleTableSelect}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {activeConnection && (
            <div className="p-1.5 border-t border-app-border">
              <button
                onClick={handleDisconnect}
                className="w-full px-2 py-1 text-[11px] text-zinc-400 hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
              >
                Desconectar
              </button>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-app-bg">
          {/* Tab Bar */}
          <div className="h-8 bg-app-surface border-b border-app-border flex items-end shrink-0">
            <div className="flex h-full overflow-x-auto">
              {tabs.map((tab) => {
                const connLabel = tab.connection
                  ? connections.find((c) => c.Name === tab.connection)?.Type || ''
                  : '';
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    className={`group relative h-full px-3 flex items-center gap-1.5 text-[11px] border-r border-app-border shrink-0 transition-colors ${
                      activeTabId === tab.id
                        ? 'bg-app-bg text-white'
                        : 'bg-app-surface text-zinc-400 hover:text-zinc-200 hover:bg-app-elevated'
                    }`}
                  >
                    {tab.connection && (
                      <div
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            connections.find((c) => c.Name === tab.connection)?.Color || '#22c55e',
                        }}
                      />
                    )}
                    <span className="max-w-[120px] truncate">{tab.title}</span>
                    {tabs.length > 1 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTab(tab.id);
                        }}
                        className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M1 1l6 6M7 1l-6 6" />
                        </svg>
                      </span>
                    )}
                    {activeTabId === tab.id && (
                      <div className="absolute bottom-0 left-0 right-0 h-px bg-accent-blue" />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleNewTab}
              className="h-full px-2.5 flex items-center text-zinc-500 hover:text-zinc-200 hover:bg-app-elevated transition-colors"
              title="Nova aba (Ctrl+T)"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 1v10M1 6h10" />
              </svg>
            </button>
          </div>

          {/* Toolbar */}
          <div className="h-8 px-2 bg-app-surface border-b border-app-border flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleExecuteQuery()}
              disabled={!activeTab.connection}
              className="h-6 px-2.5 bg-accent-green hover:bg-accent-green/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-[11px] font-medium text-white flex items-center gap-1 transition-colors"
            >
              <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 1l7 4-7 4V1z" />
              </svg>
              Run
            </button>
            <div className="h-3 w-px bg-app-border" />
            <span className="text-[10px] text-zinc-600 font-mono">Ctrl+Enter</span>

            <div className="flex-1" />
            {activeTab.result && (
              <span className="text-[10px] text-zinc-500">
                {activeTab.result.RowCount} rows {activeTab.result.Duration ? `${activeTab.result.Duration}ms` : ''}
              </span>
            )}
          </div>

          {/* SQL Editor */}
          <div className="h-44 border-b border-app-border shrink-0">
            <SqlEditor
              key={activeTab.id}
              value={activeTab.query}
              onChange={(val) => updateTab(activeTabId, { query: val })}
              onExecute={() => handleExecuteQuery()}
            />
          </div>

          {/* Error */}
          {activeTab.error && (
            <div className="mx-2 mt-2 px-2.5 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded text-accent-red text-[11px] flex items-center gap-2 animate-fade-in">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {activeTab.error}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {activeTab.result && activeTab.result.Columns && activeTab.result.Columns.length > 0 ? (
              <div className="min-w-full">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-app-surface border-b border-app-border">
                      {activeTab.result.Columns?.map((col: string) => (
                        <th
                          key={col}
                          className="px-2.5 py-1.5 text-left text-[10px] font-medium text-zinc-400 whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/30">
                    {activeTab.result.Rows?.map((row: any[], rowIdx: number) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-app-hover/30 transition-colors"
                      >
                        {row.map((cell: any, cellIdx: number) => (
                          <td
                            key={cellIdx}
                            className="px-2.5 py-1 text-[11px] whitespace-nowrap"
                          >
                            {cell !== null ? (
                              <span className="text-zinc-200">{String(cell)}</span>
                            ) : (
                              <span className="text-zinc-600 italic font-mono text-[10px]">NULL</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : activeTab.result ? (
              <div className="p-3 text-center text-zinc-500 text-[11px]">
                {activeTab.result.Message}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600">
                <div className="text-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-zinc-700">
                    <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                  <p className="text-[11px]">Execute uma query para ver os resultados</p>
                  <p className="text-[10px] text-zinc-700 mt-0.5">Ctrl+Enter para executar</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={loadConnections}
      />
    </div>
  );
}

export default App;
