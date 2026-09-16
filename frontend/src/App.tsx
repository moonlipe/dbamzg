import { useState, useEffect, useRef } from 'react';
import './style.css';
import {
  GetSavedConnections,
  Connect,
  Disconnect,
  ExecuteQuery,
  ExecuteQueryUnlimited,
  RemoveConnection,
  Commit,
  Rollback,
  GetProjects,
  RemoveProject,
} from '../wailsjs/go/main/App';
import { types } from '../wailsjs/go/models';
import SchemaTree from './components/SchemaTree/SchemaTree';
import ConnectionDialog from './components/ConnectionDialog/ConnectionDialog';
import ProjectDialog from './components/ProjectDialog/ProjectDialog';
import SqlEditor from './components/SqlEditor/SqlEditor';

type TransactionMode = 'autocommit' | 'smartcommit' | 'manual';

interface Tab {
  id: string;
  title: string;
  query: string;
  originalQuery: string; // Query sem LIMIT para "Carregar tudo"
  result: types.QueryResult | null;
  error: string | null;
  connection: string | null;
  hasChanges: boolean;
  isLoading: boolean;
}

const ROW_LIMIT = 200; // Limite padrão do backend

let tabCounter = 0;

function createTab(connection: string | null = null): Tab {
  tabCounter++;
  return {
    id: `tab-${Date.now()}-${tabCounter}`,
    title: `Query ${tabCounter}`,
    query: '',
    originalQuery: '',
    result: null,
    error: null,
    connection,
    hasChanges: false,
    isLoading: false,
  };
}

function App() {
  const [connections, setConnections] = useState<types.ConnectionConfig[]>([]);
  const [projects, setProjects] = useState<types.Project[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>(() => [createTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<types.ConnectionConfig | null>(null);
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<types.Project | null>(null);
  const [transactionMode, setTransactionMode] = useState<TransactionMode>('autocommit');
  const [page, setPage] = useState(1);
  const [showAllRows, setShowAllRows] = useState(false);

  // Refs to avoid stale closures in callbacks
  const tabsRef = useRef(tabs);
  const activeConnectionRef = useRef(activeConnection);
  const activeTabIdRef = useRef(activeTabId);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeConnectionRef.current = activeConnection; }, [activeConnection]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const updateTab = (id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  useEffect(() => {
    loadConnections();
    loadProjects();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await GetSavedConnections();
      setConnections(conns || []);
    } catch (err) {
      console.error('Erro ao carregar conexoes:', err);
    }
  };

  const loadProjects = async () => {
    try {
      const projs = await GetProjects();
      setProjects(projs || []);
    } catch (err) {
      console.error('Erro ao carregar projetos:', err);
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
    const targetId = tabId || activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === targetId);
    if (!tab) return;

    const conn = tab.connection || activeConnectionRef.current;
    if (!conn) {
      updateTab(targetId, { error: 'Nenhuma conexao ativa' });
      return;
    }

    if (!tab.query.trim()) {
      updateTab(targetId, { error: 'Digite uma query para executar' });
      return;
    }

    try {
      updateTab(targetId, { error: null, isLoading: true, originalQuery: tab.query });
      setPage(1);
      setShowAllRows(false);
      const res = await ExecuteQuery(conn, tab.query);

      // Detect DML for smartcommit
      const q = tab.query.trim().toUpperCase();
      const isDML = q.startsWith('INSERT') || q.startsWith('UPDATE') || q.startsWith('DELETE') || q.startsWith('MERGE');
      const isDDL = q.startsWith('CREATE') || q.startsWith('ALTER') || q.startsWith('DROP');

      const patch: Partial<Tab> = { result: res, error: null };
      if (isDML || isDDL) {
        patch.hasChanges = true;
      }

      // Auto-commit in autocommit mode or DDL in smartcommit
      if (transactionMode === 'autocommit' || (transactionMode === 'smartcommit' && isDDL)) {
        try { await Commit(conn); } catch (_) {}
      }

      updateTab(targetId, patch);
    } catch (err) {
      updateTab(targetId, { result: null, error: `Erro ao executar query: ${err}` });
    } finally {
      updateTab(targetId, { isLoading: false });
    }
  };

  const handleLoadAllRows = async () => {
    const targetId = activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === targetId);
    if (!tab || !tab.originalQuery) return;

    const conn = tab.connection || activeConnectionRef.current;
    if (!conn) return;

    try {
      updateTab(targetId, { isLoading: true, error: null });
      const res = await ExecuteQueryUnlimited(conn, tab.originalQuery);
      updateTab(targetId, { result: res, error: null, isLoading: false });
      setShowAllRows(true);
    } catch (err) {
      updateTab(targetId, { result: null, error: `Erro ao carregar todos os dados: ${err}`, isLoading: false });
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

  const handleEditConnection = (conn: types.ConnectionConfig) => {
    setEditingConfig(conn);
    setIsDialogOpen(true);
  };

  const handleDeleteConnection = async (name: string) => {
    if (!confirm(`Remover conexao "${name}"?`)) return;
    try {
      await RemoveConnection(name);
      if (activeConnection === name) {
        await handleDisconnect();
      }
      loadConnections();
    } catch (err) {
      console.error('Erro ao remover conexao:', err);
    }
  };

  const handleDeleteProject = async (name: string) => {
    if (!confirm(`Remover projeto "${name}" e todas as suas conexoes?`)) return;
    try {
      await RemoveProject(name);
      loadProjects();
      loadConnections();
    } catch (err) {
      console.error('Erro ao remover projeto:', err);
    }
  };

  const handleCommit = async () => {
    if (!activeTab.connection) return;
    try {
      await Commit(activeTab.connection);
      updateTab(activeTabId, { error: null, hasChanges: false });
    } catch (err) {
      updateTab(activeTabId, { error: `Erro ao fazer commit: ${err}` });
    }
  };

  const handleRollback = async () => {
    if (!activeTab.connection) return;
    try {
      await Rollback(activeTab.connection);
      updateTab(activeTabId, { error: null, hasChanges: false });
    } catch (err) {
      updateTab(activeTabId, { error: `Erro ao fazer rollback: ${err}` });
    }
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
      <header className="h-10 bg-app-surface border-b border-app-border flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent-blue rounded flex items-center justify-center">
            <span className="text-white text-[11px] font-bold">A</span>
          </div>
          <span className="font-semibold text-sm">The Amzg DB</span>
        </div>
        <div className="flex-1" />
        {activeConnection && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="text-zinc-400 text-xs">{activeConnection}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-60 bg-app-surface border-r border-app-border flex flex-col shrink-0">
          <div className="h-10 px-2 flex items-center justify-between border-b border-app-border">
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Database</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setEditingProject(null); setIsProjectDialogOpen(true); }}
                className="w-5 h-5 rounded bg-app-elevated hover:bg-accent-purple/20 hover:text-accent-purple flex items-center justify-center text-zinc-400 transition-colors"
                title="Novo Projeto"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>
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
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Projetos */}
            {projects.length > 0 && (
              <div className="py-1">
                {projects.map((project) => (
                  <div key={project.Name} className="group">
                    <div className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[11px] hover:bg-app-hover text-zinc-300">
                      <div
                        className="w-2.5 h-2.5 rounded shrink-0"
                        style={{ backgroundColor: project.Color || '#3b82f6' }}
                      />
                      <span className="font-medium truncate flex-1">{project.Name}</span>
                      <button
                        onClick={() => { setEditingProject(project); setIsProjectDialogOpen(true); }}
                        className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Editar projeto"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteProject(project.Name)}
                        className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Remover projeto"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Conexoes avulsas */}
            {connections.length > 0 && (
              <div className="py-1 border-t border-app-border">
                <div className="px-2.5 py-1 text-[9px] text-zinc-600 uppercase tracking-wider">Conexoes</div>
                {connections.map((conn) => (
                  <div key={conn.Name} className="group">
                    <div
                      className={`w-full text-left px-2.5 py-1.5 flex items-center gap-2 transition-colors text-[11px] border-l-2 ${
                        activeConnection === conn.Name
                          ? 'bg-accent-blue/10 text-white border-l-accent-blue'
                          : 'hover:bg-app-hover text-zinc-300 hover:text-white border-l-transparent'
                      }`}
                    >
                      <button
                        onClick={() => handleConnect(conn)}
                        className="flex-1 flex items-center gap-2 min-w-0"
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: conn.Color || '#22c55e' }}
                        />
                        <span className="font-medium truncate">{conn.Name}</span>
                      </button>
                      <button
                        onClick={() => handleEditConnection(conn)}
                        className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Editar conexao"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteConnection(conn.Name)}
                        className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Remover conexao"
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>

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
          <div className="h-9 bg-app-surface border-b border-app-border flex items-end shrink-0">
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
          <div className="h-9 px-2 bg-app-surface border-b border-app-border flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleExecuteQuery()}
              disabled={!activeTab.connection || activeTab.isLoading}
              className="h-7 px-3 bg-accent-green hover:bg-accent-green/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-[11px] font-medium text-white flex items-center gap-1 transition-colors"
            >
              {activeTab.isLoading ? (
                <>
                  <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeDasharray="31.42" strokeDashoffset="10" />
                  </svg>
                  Executando...
                </>
              ) : (
                <>
                  <svg width="8" height="8" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M2 1l7 4-7 4V1z" />
                  </svg>
                  Run
                </>
              )}
            </button>
            <div className="h-3 w-px bg-app-border" />
            <span className="text-[10px] text-zinc-600 font-mono">Ctrl+Enter</span>

            {/* Transaction controls */}
            {activeTab.connection && (
              <>
                <div className="h-3 w-px bg-app-border" />
                {/* Transaction mode toggle */}
                <div className="flex items-center gap-0.5 bg-app-bg rounded p-0.5 border border-app-border">
                  {(['autocommit', 'smartcommit', 'manual'] as TransactionMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setTransactionMode(mode)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                        transactionMode === mode
                          ? 'bg-accent-blue text-white'
                          : 'text-zinc-500 hover:text-zinc-300'
                      }`}
                      title={
                        mode === 'autocommit' ? 'Autocommit: cada query commita automaticamente' :
                        mode === 'smartcommit' ? 'SmartCommit: commita antes de DDL e quando precisar' :
                        'Manual: voce controla commit/rollback'
                      }
                    >
                      {mode === 'autocommit' ? 'Auto' : mode === 'smartcommit' ? 'Smart' : 'Manual'}
                    </button>
                  ))}
                </div>

                {/* Commit/Rollback: always visible in manual, visible when needed in smartcommit */}
                {(transactionMode === 'manual' || (transactionMode === 'smartcommit' && activeTab.hasChanges)) && (
                  <>
                    <div className="h-3 w-px bg-app-border" />
                    <button
                      onClick={() => handleCommit()}
                      className="h-6 px-2 bg-accent-green/20 hover:bg-accent-green/30 text-accent-green rounded text-[10px] font-medium flex items-center gap-1 transition-colors"
                      title="Commit (Ctrl+Shift+C)"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Commit
                    </button>
                    <button
                      onClick={() => handleRollback()}
                      className="h-6 px-2 bg-accent-red/20 hover:bg-accent-red/30 text-accent-red rounded text-[10px] font-medium flex items-center gap-1 transition-colors"
                      title="Rollback (Ctrl+Shift+Z)"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      Rollback
                    </button>
                  </>
                )}
              </>
            )}

            <div className="flex-1" />
            {activeTab.result && (
              <span className="text-[10px] text-zinc-500">
                {activeTab.result.RowCount} rows {activeTab.result.Duration ? `${activeTab.result.Duration}ms` : ''}
              </span>
            )}
          </div>

          {/* SQL Editor */}
          <div className="h-48 border-b border-app-border shrink-0">
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
                    {(showAllRows ? activeTab.result.Rows : activeTab.result.Rows?.slice((page - 1) * ROW_LIMIT, page * ROW_LIMIT))?.map((row: any[], rowIdx: number) => (
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
                {/* Pagination */}
                {activeTab.result.Rows && activeTab.result.Rows.length > ROW_LIMIT && (
                  <div className="sticky bottom-0 bg-app-surface border-t border-app-border px-3 py-1.5 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500">
                      {showAllRows ? (
                        `Mostrando todas as ${activeTab.result.Rows.length} linhas`
                      ) : (
                        `Mostrando ${(page - 1) * ROW_LIMIT + 1}-${Math.min(page * ROW_LIMIT, activeTab.result.Rows.length)} de ${activeTab.result.Rows.length}`
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      {!showAllRows && (
                        <button
                          onClick={() => {
                            if (confirm(`Carregar todas as linhas? Isso pode ser lento para grandes resultados.`)) {
                              handleLoadAllRows();
                            }
                          }}
                          disabled={activeTab.isLoading}
                          className="px-2 py-0.5 bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue rounded transition-colors disabled:opacity-50"
                        >
                          {activeTab.isLoading ? 'Carregando...' : 'Carregar tudo'}
                        </button>
                      )}
                      {showAllRows ? (
                        <button
                          onClick={() => { setShowAllRows(false); setPage(1); }}
                          className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated text-zinc-400 rounded transition-colors"
                        >
                          Paginar
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated disabled:opacity-40 text-zinc-400 rounded transition-colors"
                          >
                            Anterior
                          </button>
                          <span className="text-zinc-500">{page}/{Math.ceil(activeTab.result.Rows.length / ROW_LIMIT)}</span>
                          <button
                            onClick={() => setPage((p) => Math.min(Math.ceil(activeTab.result!.Rows!.length / ROW_LIMIT), p + 1))}
                            disabled={page >= Math.ceil(activeTab.result.Rows.length / ROW_LIMIT)}
                            className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated disabled:opacity-40 text-zinc-400 rounded transition-colors"
                          >
                            Proximo
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
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

      {/* Status Bar */}
      <footer className="h-7 bg-app-surface border-t border-app-border flex items-center px-3 text-[11px] shrink-0">
        {activeConnection ? (
          <div className="flex items-center gap-2">
            {(() => {
              const conn = connections.find((c) => c.Name === activeConnection);
              return (
                <>
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: conn?.Color || '#22c55e' }}
                  />
                  <span className="text-zinc-300 font-medium">{activeConnection}</span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500 uppercase">{conn?.Type}</span>
                  <span className="text-zinc-600">|</span>
                  <span className="text-zinc-500">{conn?.Host}:{conn?.Port}</span>
                </>
              );
            })()}
          </div>
        ) : (
          <span className="text-zinc-600">Nenhuma conexao ativa</span>
        )}
        <div className="flex-1" />
        <span className="text-zinc-600">The Amzg DB v0.1.0</span>
      </footer>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setEditingConfig(null); }}
        onSave={loadConnections}
        editConfig={editingConfig || undefined}
      />

      {/* Project Dialog */}
      <ProjectDialog
        isOpen={isProjectDialogOpen}
        onClose={() => { setIsProjectDialogOpen(false); setEditingProject(null); }}
        onSave={() => { loadProjects(); loadConnections(); }}
        editProject={editingProject || undefined}
      />
    </div>
  );
}

export default App;
