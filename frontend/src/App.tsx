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

function App() {
  const [connections, setConnections] = useState<types.ConnectionConfig[]>([]);
  const [activeConnection, setActiveConnection] = useState<string | null>(null);
  const [query, setQuery] = useState('SELECT * FROM ');
  const [result, setResult] = useState<types.QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      const conns = await GetSavedConnections();
      setConnections(conns || []);
    } catch (err) {
      console.error('Erro ao carregar conexões:', err);
    }
  };

  const handleConnect = async (config: types.ConnectionConfig) => {
    try {
      await Connect(config);
      setActiveConnection(config.Name);
      setError(null);
    } catch (err) {
      setError(`Erro ao conectar: ${err}`);
    }
  };

  const handleDisconnect = async () => {
    if (activeConnection) {
      try {
        await Disconnect(activeConnection);
        setActiveConnection(null);
        setResult(null);
      } catch (err) {
        setError(`Erro ao desconectar: ${err}`);
      }
    }
  };

  const handleExecuteQuery = async () => {
    if (!activeConnection) {
      setError('Nenhuma conexão ativa');
      return;
    }

    try {
      const res = await ExecuteQuery(activeConnection, query);
      setResult(res);
      setError(null);
    } catch (err) {
      setError(`Erro ao executar query: ${err}`);
    }
  };

  const handleTableSelect = (tableName: string) => {
    setQuery(`SELECT * FROM ${tableName}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleExecuteQuery();
    }
  };

  return (
    <div className="h-screen flex flex-col bg-app-bg text-zinc-100" onKeyDown={handleKeyDown}>
      {/* Header */}
      <header className="h-11 bg-app-surface border-b border-app-border flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent-blue rounded flex items-center justify-center">
            <span className="text-white text-xs font-bold">A</span>
          </div>
          <span className="font-semibold text-sm">The Amzg DB</span>
        </div>
        <div className="flex-1" />
        {activeConnection && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span className="text-zinc-400">{activeConnection}</span>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-60 bg-app-surface border-r border-app-border flex flex-col shrink-0">
          {/* Sidebar Header */}
          <div className="h-10 px-3 flex items-center justify-between border-b border-app-border">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Database</span>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="w-5 h-5 rounded bg-app-elevated hover:bg-accent-blue/20 hover:text-accent-blue flex items-center justify-center text-zinc-400 transition-colors"
              title="Nova Conexão"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 1v10M1 6h10" />
              </svg>
            </button>
          </div>

          {/* Connections List */}
          <div className="flex-1 overflow-y-auto">
            {connections.length === 0 ? (
              <div className="p-4 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-app-elevated flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500">
                    <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                </div>
                <p className="text-xs text-zinc-500">Nenhuma conexão</p>
                <button
                  onClick={() => setIsDialogOpen(true)}
                  className="mt-2 text-xs text-accent-blue hover:text-accent-blue/80"
                >
                  Criar primeira conexão
                </button>
              </div>
            ) : (
              <div className="py-1">
                {connections.map((conn) => (
                  <div key={conn.Name} className="group">
                    <button
                      onClick={() => handleConnect(conn)}
                      className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                        activeConnection === conn.Name
                          ? 'bg-accent-blue/10 text-white'
                          : 'hover:bg-app-hover text-zinc-300 hover:text-white'
                      }`}
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-app-surface"
                        style={{
                          backgroundColor: conn.Color || '#22c55e',
                          boxShadow: activeConnection === conn.Name ? `0 0 8px ${conn.Color || '#22c55e'}40` : 'none',
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{conn.Name}</div>
                        <div className="text-2xs text-zinc-500 uppercase">{conn.Type}</div>
                      </div>
                      {activeConnection === conn.Name && (
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-blue shrink-0" />
                      )}
                    </button>
                    
                    {/* Schema Tree */}
                    {activeConnection === conn.Name && (
                      <div className="bg-app-bg/50 animate-fade-in">
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

          {/* Sidebar Footer */}
          {activeConnection && (
            <div className="p-2 border-t border-app-border">
              <button
                onClick={handleDisconnect}
                className="w-full px-3 py-1.5 text-xs text-zinc-400 hover:text-accent-red hover:bg-accent-red/10 rounded transition-colors"
              >
                Desconectar
              </button>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-app-bg">
          {/* Toolbar */}
          <div className="h-10 px-3 bg-app-surface border-b border-app-border flex items-center gap-3 shrink-0">
            <button
              onClick={handleExecuteQuery}
              disabled={!activeConnection}
              className="h-7 px-3 bg-accent-green hover:bg-accent-green/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-xs font-medium text-white flex items-center gap-1.5 transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M2 1l7 4-7 4V1z" />
              </svg>
              Run
            </button>
            <div className="h-4 w-px bg-app-border" />
            <span className="text-2xs text-zinc-500 font-mono">Ctrl+Enter</span>
            
            {/* Right side info */}
            <div className="flex-1" />
            {result && (
              <span className="text-2xs text-zinc-500">
                {result.RowCount} rows · {result.Duration}ms
              </span>
            )}
          </div>

          {/* SQL Editor */}
          <div className="h-48 border-b border-app-border shrink-0">
            <SqlEditor value={query} onChange={setQuery} />
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mt-3 px-3 py-2 bg-accent-red/10 border border-accent-red/20 rounded text-accent-red text-xs flex items-center gap-2 animate-fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {error}
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {result && result.Columns && result.Columns.length > 0 ? (
              <div className="min-w-full">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-app-surface border-b border-app-border">
                      {result.Columns?.map((col: string) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left text-xs font-medium text-zinc-400 whitespace-nowrap"
                        >
                          <div className="flex items-center gap-1">
                            <span>{col}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/50">
                    {result.Rows?.map((row: any[], rowIdx: number) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-app-hover/50 transition-colors"
                      >
                        {row.map((cell: any, cellIdx: number) => (
                          <td
                            key={cellIdx}
                            className="px-3 py-1.5 text-sm whitespace-nowrap"
                          >
                            {cell !== null ? (
                              <span className="text-zinc-200">{String(cell)}</span>
                            ) : (
                              <span className="text-zinc-600 italic font-mono text-xs">NULL</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : result ? (
              <div className="p-4 text-center text-zinc-500 text-sm">
                {result.Message}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600">
                <div className="text-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-3 text-zinc-700">
                    <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                  <p className="text-sm">Execute uma query para ver os resultados</p>
                  <p className="text-xs text-zinc-700 mt-1">Ctrl+Enter para executar</p>
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
