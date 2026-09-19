import { useState, useEffect, useRef, useCallback } from 'react';
import './style.css';
import {
  GetSavedConnections,
  Connect,
  Disconnect,
  TestConnection,
  ExecuteQuery,
  ExecuteQueryUnlimited,
  RemoveConnection,
  Commit,
  Rollback,
  GetProjects,
  RemoveProject,
  GetDatabases,
  GetSchemas,
  SaveSavedQuery,
  RemoveSavedQuery,
  GetSavedQueries,
  ExecuteQueryPaginated,
  ExtractSQLVariables,
  ReplaceSQLVariables,
  ExportProject,
  ImportProject,
} from '../wailsjs/go/main/App';
import { types, sqlvariables } from '../wailsjs/go/models';
import SchemaTree from './components/SchemaTree/SchemaTree';
import { Folder, ChevronRight, Database, Settings, PanelLeftClose, PanelLeft, Unplug } from 'lucide-react';
import ConnectionDialog from './components/ConnectionDialog/ConnectionDialog';
import ProjectDialog from './components/ProjectDialog/ProjectDialog';
import SqlEditor, { SqlEditorHandle } from './components/SqlEditor/SqlEditor';
import VariableModal from './components/VariableModal/VariableModal';
import SettingsModal, { AppSettings } from './components/SettingsModal/SettingsModal';
import ContextMenu, { ContextMenuItem } from './components/ContextMenu/ContextMenu';

// --- Grid Feature Types ---
interface CellPos {
  rowIdx: number;
  colIdx: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  rowIdx: number;
  colIdx: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastIdCounter = 0;

function extractTableName(query: string): string | null {
  const upper = query.trim().toUpperCase();
  // Match SELECT ... FROM <table> (simple cases)
  const selectMatch = upper.match(/FROM\s+["`]?(\w+(?:\.\w+)?)["`]?/);
  if (selectMatch) {
    return query.trim().match(new RegExp(`FROM\\s+["\`]?\\s*(${selectMatch[1]})\\s*["\`]?`, 'i'))?.[1] || selectMatch[1];
  }
  // Match UPDATE <table>
  const updateMatch = upper.match(/UPDATE\s+["`]?(\w+(?:\.\w+)?)["`]?/);
  if (updateMatch) {
    return query.trim().match(new RegExp(`UPDATE\\s+["\`]?\\s*(${updateMatch[1]})\\s*["\`]?`, 'i'))?.[1] || updateMatch[1];
  }
  return null;
}

type TransactionMode = 'autocommit' | 'smartcommit' | 'manual';

interface Tab {
  id: string;
  title: string;
  query: string;
  originalQuery: string;
  result: types.QueryResult | null;
  error: string | null;
  connection: string | null;
  hasChanges: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  pendingTransactions: number;
  offset: number;
  hasMoreRows: boolean;
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
    isLoadingMore: false,
    pendingTransactions: 0,
    offset: 0,
    hasMoreRows: false,
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
  const [currentDatabase, setCurrentDatabase] = useState<string | null>(null);
  const [currentSchema, setCurrentSchema] = useState<string | null>(null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [savedQueries, setSavedQueries] = useState<types.SavedQuery[]>([]);
  const [isSavedQueriesOpen, setIsSavedQueriesOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [connContextMenu, setConnContextMenu] = useState<{ x: number; y: number; conn: types.ConnectionConfig } | null>(null);
  const [projContextMenu, setProjContextMenu] = useState<{ x: number; y: number; project: types.Project } | null>(null);
  const [copySpecialOpen, setCopySpecialOpen] = useState(false);
  const [copySpecialConfig, setCopySpecialConfig] = useState({
    includeHeaders: true,
    delimiter: '\t',
    customDelimiter: '',
    quoteStrings: false,
  });

  // --- SQL Variables ---
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [detectedVariables, setDetectedVariables] = useState<sqlvariables.Variable[]>([]);
  const [pendingQuery, setPendingQuery] = useState<{ query: string; conn: string } | null>(null);

  // --- Settings ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('amzg-settings');
      return saved ? JSON.parse(saved) : { executeMode: 'statement', statementDelimiter: 'blank_line', autoExpandProject: false, confirmOnDelete: true, fontSize: 13, uiFontSize: 12 };
    } catch { return { executeMode: 'statement', statementDelimiter: 'blank_line', autoExpandProject: false, confirmOnDelete: true, fontSize: 13, uiFontSize: 12 }; }
  });

  // --- Editor Ref ---
  const editorRef = useRef<SqlEditorHandle>(null);

  // --- Grid Feature States ---
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [selectedColumns, setSelectedColumns] = useState<Set<number>>(new Set());
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelectedCol, setLastSelectedCol] = useState<number | null>(null);
  const [lastSelectedCell, setLastSelectedCell] = useState<CellPos | null>(null);
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editedCells, setEditedCells] = useState<Map<string, any>>(new Map());
  const [focusedCell, setFocusedCell] = useState<CellPos | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const lastSelectedRow = useRef<number | null>(null);
  const savingRef = useRef(false);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  // Refs to avoid stale closures in callbacks
  const tabsRef = useRef(tabs);
  const activeConnectionRef = useRef(activeConnection);
  const activeTabIdRef = useRef(activeTabId);
  const connectionsRef = useRef(connections);
  const projectsRef = useRef(projects);

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeConnectionRef.current = activeConnection; }, [activeConnection]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);
  useEffect(() => { connectionsRef.current = connections; }, [connections]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // Close saved queries dropdown on outside click
  useEffect(() => {
    if (!isSavedQueriesOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.relative')) {
        setIsSavedQueriesOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isSavedQueriesOpen]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const updateTab = (id: string, patch: Partial<Tab>) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  useEffect(() => {
    loadConnections();
    loadProjects();
    loadSavedQueries();
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

  const loadSavedQueries = async () => {
    try {
      const queries = await GetSavedQueries();
      setSavedQueries(queries || []);
    } catch (err) {
      console.error('Erro ao carregar queries salvas:', err);
    }
  };

  const handleConnect = async (config: types.ConnectionConfig) => {
    try {
      // Disconnect previous connection if any
      if (activeConnectionRef.current && activeConnectionRef.current !== config.Name) {
        try { await Disconnect(activeConnectionRef.current); } catch (_) {}
      }
      await Connect(config);
      setActiveConnection(config.Name);
      updateTab(activeTabId, { connection: config.Name, error: null });

      // Load databases for the connection
      try {
        const dbs = await GetDatabases(config.Name);
        setDatabases(dbs || []);
        if (dbs && dbs.length > 0) {
          setCurrentDatabase(dbs[0]);
          // Load schemas for first database
          try {
            const schs = await GetSchemas(config.Name, dbs[0]);
            setSchemas(schs || []);
            if (schs && schs.length > 0) {
              setCurrentSchema(schs[0]);
            }
          } catch (_) {}
        }
      } catch (_) {}
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

  const ensureConnection = async (connName: string): Promise<boolean> => {
    if (activeConnectionRef.current === connName) return true;
    const connObj = [...projectsRef.current.flatMap((p) => p.Connections || []), ...connectionsRef.current].find(
      (c) => c.Name === connName
    );
    if (!connObj) return false;
    try {
      if (activeConnectionRef.current && activeConnectionRef.current !== connName) {
        try { await Disconnect(activeConnectionRef.current); } catch (_) {}
      }
      await Connect(connObj);
      setActiveConnection(connObj.Name);
      return true;
    } catch (_) {
      return false;
    }
  };

  const executeSQL = async (queryToRun: string, conn: string, targetId: string) => {
    try {
      const q = queryToRun.trim().toUpperCase();
      const isDML = q.startsWith('INSERT') || q.startsWith('UPDATE') || q.startsWith('DELETE') || q.startsWith('MERGE');
      const isDDL = q.startsWith('CREATE') || q.startsWith('ALTER') || q.startsWith('DROP');
      const isSelect = q.startsWith('SELECT') || q.startsWith('WITH');

      const initPatch: Partial<Tab> = { error: null, isLoading: true, offset: 0, hasMoreRows: false };
      if (isSelect) {
        initPatch.originalQuery = queryToRun;
      }
      updateTab(targetId, initPatch);

      const res = await ExecuteQueryPaginated(conn, queryToRun, 0, ROW_LIMIT, transactionMode);

      const hasMore = res.RowCount >= ROW_LIMIT;
      const resultPatch: Partial<Tab> = { result: res, error: null, offset: ROW_LIMIT, hasMoreRows: hasMore };
      if (transactionMode === 'manual') {
        resultPatch.hasChanges = true;
        resultPatch.pendingTransactions = (tabsRef.current.find((t) => t.id === targetId)?.pendingTransactions || 0) + 1;
      } else if (isDML || isDDL) {
        resultPatch.hasChanges = true;
        if (transactionMode === 'smartcommit' && isDML) {
          resultPatch.pendingTransactions = (tabsRef.current.find((t) => t.id === targetId)?.pendingTransactions || 0) + 1;
        }
      }

      if (transactionMode === 'autocommit' || (transactionMode === 'smartcommit' && isDDL)) {
        try { await Commit(conn); } catch (_) {}
      }

      updateTab(targetId, resultPatch);
    } catch (err) {
      updateTab(targetId, { result: null, error: `Erro ao executar query: ${err}` });
    } finally {
      updateTab(targetId, { isLoading: false });
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

    if (conn !== activeConnectionRef.current) {
      updateTab(targetId, { isLoading: true });
      const ok = await ensureConnection(conn);
      if (!ok) {
        updateTab(targetId, { isLoading: false, error: `Nao foi possivel conectar a '${conn}'` });
        return;
      }
    }

    let queryToRun = '';
    if (editorRef.current) {
      queryToRun = editorRef.current.getSelectedOrCurrentStatement();
    } else {
      queryToRun = tab.query;
    }

    if (!queryToRun.trim()) {
      updateTab(targetId, { error: 'Digite uma query para executar' });
      return;
    }

    const vars = await ExtractSQLVariables(queryToRun) || [];
    if (vars.length > 0) {
      setDetectedVariables(vars);
      setPendingQuery({ query: queryToRun, conn });
      setVariableModalOpen(true);
      return;
    }

    await executeSQL(queryToRun, conn, targetId);
    editorRef.current?.focus();
  };

  const handleExecuteAll = async (tabId?: string) => {
    const targetId = tabId || activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === targetId);
    if (!tab) return;

    const conn = tab.connection || activeConnectionRef.current;
    if (!conn) {
      updateTab(targetId, { error: 'Nenhuma conexao ativa' });
      return;
    }

    if (conn !== activeConnectionRef.current) {
      updateTab(targetId, { isLoading: true });
      const ok = await ensureConnection(conn);
      if (!ok) {
        updateTab(targetId, { isLoading: false, error: `Nao foi possivel conectar a '${conn}'` });
        return;
      }
    }

    let queryToRun = '';
    if (editorRef.current) {
      queryToRun = editorRef.current.getFullText();
    } else {
      queryToRun = tab.query;
    }

    if (!queryToRun.trim()) {
      updateTab(targetId, { error: 'Digite uma query para executar' });
      return;
    }

    const vars = await ExtractSQLVariables(queryToRun) || [];
    if (vars.length > 0) {
      setDetectedVariables(vars);
      setPendingQuery({ query: queryToRun, conn });
      setVariableModalOpen(true);
      return;
    }

    await executeSQL(queryToRun, conn, targetId);
    editorRef.current?.focus();
  };

  const handleVariableExecute = async (values: Record<string, string>) => {
    if (!pendingQuery) return;
    const replaced = await ReplaceSQLVariables(pendingQuery.query, values);
    const conn = pendingQuery.conn;
    if (conn && conn !== activeConnectionRef.current) {
      const ok = await ensureConnection(conn);
      if (!ok) {
        showToast(`Nao foi possivel conectar a '${conn}'`, 'error');
        setPendingQuery(null);
        return;
      }
    }
    await executeSQL(replaced, conn, activeTabIdRef.current);
    setPendingQuery(null);
    editorRef.current?.focus();
  };

  const handleLoadMore = async () => {
    const targetId = activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === targetId);
    if (!tab || !tab.originalQuery || tab.isLoadingMore || !tab.hasMoreRows) return;

    const conn = tab.connection || activeConnectionRef.current;
    if (!conn) return;

    try {
      updateTab(targetId, { isLoadingMore: true, error: null });
      const res = await ExecuteQueryPaginated(conn, tab.originalQuery, tab.offset, ROW_LIMIT, transactionMode);

      // Append new rows to existing result
      const existingRows = tab.result?.Rows || [];
      const existingCount = tab.result?.RowCount || 0;
      const newRows = [...existingRows, ...(res.Rows || [])];
      const totalCount = existingCount + res.RowCount;

      const mergedResult: types.QueryResult = {
        Columns: res.Columns || tab.result?.Columns || [],
        ColumnTypes: res.ColumnTypes || tab.result?.ColumnTypes || [],
        Rows: newRows,
        RowCount: totalCount,
        Message: res.Message,
        Duration: res.Duration,
      };

      const newOffset = tab.offset + ROW_LIMIT;
      const hasMore = res.RowCount >= ROW_LIMIT;

      updateTab(targetId, {
        result: mergedResult,
        offset: newOffset,
        hasMoreRows: hasMore,
        isLoadingMore: false,
      });
    } catch (err) {
      updateTab(targetId, { error: `Erro ao carregar mais linhas: ${err}`, isLoadingMore: false });
    }
  };

  const handleLoadAll = async () => {
    const targetId = activeTabIdRef.current;
    const currentTabs = tabsRef.current;
    const tab = currentTabs.find((t) => t.id === targetId);
    if (!tab || !tab.originalQuery) return;

    const conn = tab.connection || activeConnectionRef.current;
    if (!conn) return;

    try {
      updateTab(targetId, { isLoading: true, error: null });
      const res = await ExecuteQueryUnlimited(conn, tab.originalQuery);
      updateTab(targetId, { result: res, error: null, isLoading: false, hasMoreRows: false });
    } catch (err) {
      updateTab(targetId, { result: null, error: `Erro ao carregar todos os dados: ${err}`, isLoading: false });
    }
  };

  const handleTableSelect = (tableName: string) => {
    updateTab(activeTabId, { query: `SELECT * FROM ${tableName}` });
  };

  // --- Saved Queries ---

  const handleSaveQuery = async () => {
    const name = prompt('Nome para a query salva:', activeTab.title);
    if (!name) return;

    updateTab(activeTabId, { title: name });

    const conn = activeTab.connection || activeConnectionRef || '';
    const connName = typeof conn === 'string' ? conn : '';

    try {
      const sq: types.SavedQuery = { Name: name, Query: activeTab.query, Connection: connName };
      await SaveSavedQuery(sq);
      await loadSavedQueries();
    } catch (err) {
      console.error('Erro ao salvar query:', err);
    }
  };

  const handleQuickSave = async () => {
    const existingNames = savedQueries.map((sq) => sq.Name);
    if (activeTab.title && existingNames.includes(activeTab.title)) {
      const conn = activeTab.connection || activeConnectionRef || '';
      const connName = typeof conn === 'string' ? conn : '';
      try {
        const sq: types.SavedQuery = { Name: activeTab.title, Query: activeTab.query, Connection: connName };
        await SaveSavedQuery(sq);
        await loadSavedQueries();
      } catch (err) {
        console.error('Erro ao salvar query:', err);
      }
    } else {
      handleSaveQuery();
    }
  };

  const handleLoadSavedQuery = (sq: types.SavedQuery) => {
    const existing = tabs.find((t) => t.title === sq.Name);
    if (existing) {
      setActiveTabId(existing.id);
      if (sq.Connection && sq.Connection !== activeConnection) {
        setActiveConnection(sq.Connection);
        const connObj = [...projects.flatMap((p) => p.Connections || []), ...connections].find(
          (c) => c.Name === sq.Connection
        );
        if (connObj) handleConnect(connObj);
      }
      setIsSavedQueriesOpen(false);
      return;
    }

    const conn = sq.Connection || activeConnection || '';
    const newTab = createTab(conn);
    newTab.query = sq.Query;
    newTab.title = sq.Name;
    newTab.originalQuery = sq.Query;
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    if (sq.Connection && sq.Connection !== activeConnection) {
      setActiveConnection(sq.Connection);
      const connObj = [...projects.flatMap((p) => p.Connections || []), ...connections].find(
        (c) => c.Name === sq.Connection
      );
      if (connObj) handleConnect(connObj);
    }
    setIsSavedQueriesOpen(false);
  };

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('amzg-settings', JSON.stringify(newSettings));
  };

  const handleDeleteSavedQuery = async (name: string) => {
    if (!confirm(`Remover query salva "${name}"?`)) return;
    try {
      await RemoveSavedQuery(name);
      await loadSavedQueries();
    } catch (err) {
      console.error('Erro ao remover query salva:', err);
    }
  };

  // --- Infinite Scroll ---

  const handleResultsScroll = () => {
    const container = resultsContainerRef.current;
    if (!container) return;

    const { scrollTop, clientHeight, scrollHeight } = container;
    if (scrollTop + clientHeight >= scrollHeight - 50) {
      const targetId = activeTabIdRef.current;
      const tab = tabsRef.current.find((t) => t.id === targetId);
      if (tab && tab.hasMoreRows && !tab.isLoadingMore && !tab.isLoading) {
        handleLoadMore();
      }
    }
  };

  const handleNewTab = () => {
    const newTab = createTab(activeConnection);
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleOpenQueryFromTree = (query: string) => {
    const newTab = createTab(activeConnection);
    newTab.query = query;
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleShowDefinition = (name: string, type: string) => {
    const conn = activeTab.connection || activeConnection;
    if (!conn) return;
    const newTab = createTab(conn);
    newTab.query = `-- Definition: ${name} (${type})`;
    newTab.title = name;
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
      loadProjects();
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

  const handleExportProject = async (name: string) => {
    try {
      const json = await ExportProject(name);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name + '.amzg-proj';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Projeto exportado com sucesso', 'success');
    } catch (err) {
      showToast(`Erro ao exportar: ${err}`, 'error');
    }
  };

  const handleImportProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.amzg-proj';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        await ImportProject(text);
        loadProjects();
        loadConnections();
        showToast('Projeto importado com sucesso', 'success');
      } catch (err) {
        showToast(`Erro ao importar: ${err}`, 'error');
      }
    };
    input.click();
  };

  // --- Grid Feature Handlers ---

  const handleRowClick = (rowIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    const rows = activeTab.result?.Rows;
    if (!rows) return;

    if (e.ctrlKey || e.metaKey) {
      setSelectedRows((prev) => {
        const next = new Set(prev);
        if (next.has(rowIdx)) next.delete(rowIdx);
        else next.add(rowIdx);
        return next;
      });
    } else if (e.shiftKey && lastSelectedRow.current !== null) {
      const start = Math.min(lastSelectedRow.current, rowIdx);
      const end = Math.max(lastSelectedRow.current, rowIdx);
      setSelectedRows((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
    } else {
      setSelectedRows(new Set([rowIdx]));
      setSelectedColumns(new Set());
    }
    setSelectedCells(new Set());
    lastSelectedRow.current = rowIdx;
  };

  const handleCellDoubleClick = (rowIdx: number, colIdx: number, cellValue: any) => {
    setEditingCell({ rowIdx, colIdx });
    setEditValue(cellValue !== null ? String(cellValue) : '');
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleCellClick = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const cellKey = `${rowIdx}:${colIdx}`;

    if (e.ctrlKey || e.metaKey) {
      setSelectedCells((prev) => {
        const next = new Set(prev);
        if (next.has(cellKey)) next.delete(cellKey);
        else next.add(cellKey);
        return next;
      });
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      setFocusedCell({ rowIdx, colIdx });
      setLastSelectedCell({ rowIdx, colIdx });
    } else if (e.shiftKey && lastSelectedCell) {
      const minRow = Math.min(lastSelectedCell.rowIdx, rowIdx);
      const maxRow = Math.max(lastSelectedCell.rowIdx, rowIdx);
      const minCol = Math.min(lastSelectedCell.colIdx, colIdx);
      const maxCol = Math.max(lastSelectedCell.colIdx, colIdx);
      const next = new Set<string>();
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          next.add(`${r}:${c}`);
        }
      }
      setSelectedCells(next);
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      setFocusedCell({ rowIdx, colIdx });
    } else {
      setSelectedCells(new Set([cellKey]));
      setSelectedRows(new Set());
      setSelectedColumns(new Set());
      setFocusedCell({ rowIdx, colIdx });
      setLastSelectedCell({ rowIdx, colIdx });
    }
  };

  const handleColumnClick = (colIdx: number, e: React.MouseEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      setSelectedColumns((prev) => {
        const next = new Set(prev);
        if (next.has(colIdx)) next.delete(colIdx);
        else next.add(colIdx);
        return next;
      });
    } else if (e.shiftKey && lastSelectedCol !== null) {
      const start = Math.min(lastSelectedCol, colIdx);
      const end = Math.max(lastSelectedCol, colIdx);
      setSelectedColumns((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) next.add(i);
        return next;
      });
    } else {
      setSelectedColumns(new Set([colIdx]));
      setSelectedRows(new Set());
    }
    setSelectedCells(new Set());
    setLastSelectedCol(colIdx);
  };

  const getCopyDelimiter = () => {
    if (copySpecialConfig.delimiter === 'custom') return copySpecialConfig.customDelimiter;
    return copySpecialConfig.delimiter;
  };

  const handleCopySpecial = () => {
    if (!activeTab.result) return;
    const delimiter = getCopyDelimiter();
    const rows = activeTab.result.Rows || [];
    const cols = activeTab.result.Columns || [];
    const lines: string[] = [];

    if (copySpecialConfig.includeHeaders) {
      lines.push(cols.join(delimiter));
    }

    const rowIndices = selectedRows.size > 0
      ? Array.from(selectedRows).sort((a, b) => a - b)
      : rows.map((_, i) => i);

    for (const i of rowIndices) {
      const row = rows[i];
      if (!row) continue;
      const cells = row.map((c) => {
        if (c === null || c === undefined) return 'NULL';
        const s = String(c);
        if (copySpecialConfig.quoteStrings && typeof c === 'string') {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      });
      lines.push(cells.join(delimiter));
    }

    copyToClipboard(lines.join('\n'));
    showToast('Dados copiados (formato especial)', 'success');
    setCopySpecialOpen(false);
  };

  const saveEdit = async () => {
    if (savingRef.current) return;
    if (!editingCell || !activeTab.result) return;
    savingRef.current = true;

    const { rowIdx, colIdx } = editingCell;
    const row = activeTab.result.Rows?.[rowIdx];
    const colName = activeTab.result.Columns?.[colIdx];
    if (!row || !colName) { savingRef.current = false; return; }

    const originalValue = row[colIdx];
    let newValue: any = editValue;

    // Type coercion for common types
    if (originalValue === null) {
      if (editValue.toUpperCase() === 'NULL') newValue = null;
      else if (!isNaN(Number(editValue))) newValue = Number(editValue);
    } else if (typeof originalValue === 'number') {
      newValue = editValue === '' ? null : Number(editValue);
    } else if (typeof originalValue === 'boolean') {
      newValue = editValue.toLowerCase() === 'true' || editValue === '1';
    }

    const oldMapKey = `${rowIdx}-${colIdx}`;
    const newMap = new Map(editedCells);
    newMap.set(oldMapKey, newValue);
    setEditedCells(newMap);

    // Generate UPDATE statement
    const tn = tableName || extractTableName(activeTab.query);
    if (!tn) {
      showToast('Nao foi possivel determinar o nome da tabela para UPDATE', 'error');
      setEditingCell(null);
      savingRef.current = false;
      return;
    }

    // Build WHERE clause from all columns (use original values as PK approximation)
    const pkParts: string[] = [];
    activeTab.result.Columns?.forEach((c, i) => {
      const orig = row[i];
      if (orig === null) pkParts.push(`"${c}" IS NULL`);
      else if (typeof orig === 'string') pkParts.push(`"${c}" = '${String(orig).replace(/'/g, "''")}'`);
      else pkParts.push(`"${c}" = ${orig}`);
    });

    // SET clause
    let setClause: string;
    if (newValue === null) setClause = `"${colName}" = NULL`;
    else if (typeof newValue === 'string') setClause = `"${colName}" = '${newValue.replace(/'/g, "''")}'`;
    else setClause = `"${colName}" = ${newValue}`;

    const sql = `UPDATE ${tn} SET ${setClause} WHERE ${pkParts.join(' AND ')}`;

    // Capture values before clearing edit state
    const refreshQuery = activeTab.originalQuery || activeTab.query;
    const conn = activeTab.connection || activeConnectionRef.current;
    const tabId = activeTabId;

    setEditingCell(null);

    if (!conn) {
      showToast('Nenhuma conexao ativa', 'error');
      savingRef.current = false;
      return;
    }

    try {
      await ExecuteQuery(conn, sql, transactionMode);
      showToast('UPDATE executado com sucesso');
      const res = await ExecuteQueryPaginated(conn, refreshQuery, 0, ROW_LIMIT, transactionMode);
      updateTab(tabId, { result: res, error: null });
      setEditedCells(new Map());
    } catch (err) {
      showToast(`Erro ao executar UPDATE: ${err}`, 'error');
    } finally {
      savingRef.current = false;
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (editingCell && activeTab.result) {
        const cols = activeTab.result.Columns?.length || 0;
        const rows = activeTab.result.Rows?.length || 0;
        let nextRow = editingCell.rowIdx;
        let nextCol = editingCell.colIdx + (e.shiftKey ? -1 : 1);
        if (nextCol >= cols) { nextCol = 0; nextRow++; }
        else if (nextCol < 0) { nextCol = cols - 1; nextRow--; }
        if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
          saveEdit();
          const val = activeTab.result.Rows?.[nextRow]?.[nextCol];
          setEditingCell({ rowIdx: nextRow, colIdx: nextCol });
          setEditValue(val !== null && val !== undefined ? String(val) : '');
          setTimeout(() => editInputRef.current?.focus(), 0);
        } else {
          saveEdit();
        }
      }
    }
  };

  // --- Copy Handlers ---
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleCopyCell = () => {
    if (!contextMenu || !activeTab.result) return;
    const val = activeTab.result.Rows?.[contextMenu.rowIdx]?.[contextMenu.colIdx];
    copyToClipboard(val !== null && val !== undefined ? String(val) : '');
    showToast('Celula copiada', 'success');
    setContextMenu(null);
  };

  const handleCopyRow = () => {
    if (!contextMenu || !activeTab.result) return;
    const row = activeTab.result.Rows?.[contextMenu.rowIdx];
    if (row) copyToClipboard(row.map((c) => (c === null ? 'NULL' : String(c))).join('\t'));
    showToast('Linha copiada', 'success');
    setContextMenu(null);
  };

  const handleCopySelectedRows = () => {
    if (!activeTab.result || selectedRows.size === 0) return;
    const lines = Array.from(selectedRows)
      .sort((a, b) => a - b)
      .map((i) => {
        const row = activeTab.result!.Rows?.[i];
        return row ? row.map((c) => (c === null ? 'NULL' : String(c))).join('\t') : '';
      });
    copyToClipboard(lines.join('\n'));
    showToast(`${selectedRows.size} linhas copiadas`, 'success');
    setContextMenu(null);
  };

  const handleCopyAsInsert = () => {
    if (!contextMenu || !activeTab.result) return;
    const row = activeTab.result.Rows?.[contextMenu.rowIdx];
    const cols = activeTab.result.Columns;
    if (!row || !cols) return;
    const tn = tableName || extractTableName(activeTab.query) || 'tabela';
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const valList = row.map((v) => {
      if (v === null) return 'NULL';
      if (typeof v === 'number') return String(v);
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      return `'${String(v).replace(/'/g, "''")}'`;
    }).join(', ');
    copyToClipboard(`INSERT INTO ${tn} (${colList}) VALUES (${valList});`);
    showToast('INSERT copiado', 'success');
    setContextMenu(null);
  };

  const handleSelectAll = () => {
    if (!activeTab.result?.Rows) return;
    setSelectedRows(new Set(activeTab.result.Rows.map((_, i) => i)));
    setContextMenu(null);
  };

  const handleCopySelectedRowsToolbar = () => {
    if (selectedRows.size === 0 || !activeTab.result) return;
    const lines = Array.from(selectedRows)
      .sort((a, b) => a - b)
      .map((i) => {
        const row = activeTab.result!.Rows?.[i];
        return row ? row.map((c) => (c === null ? 'NULL' : String(c))).join('\t') : '';
      });
    copyToClipboard(lines.join('\n'));
    showToast(`${selectedRows.size} linhas copiadas`, 'success');
  };

  const handleCopySelectedAsInsertToolbar = () => {
    if (selectedRows.size === 0 || !activeTab.result) return;
    const cols = activeTab.result.Columns;
    const tn = tableName || extractTableName(activeTab.query) || 'tabela';
    if (!cols) return;
    const colList = cols.map((c) => `"${c}"`).join(', ');
    const inserts = Array.from(selectedRows)
      .sort((a, b) => a - b)
      .map((i) => {
        const row = activeTab.result!.Rows?.[i];
        if (!row) return '';
        const valList = row.map((v) => {
          if (v === null) return 'NULL';
          if (typeof v === 'number') return String(v);
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
          return `'${String(v).replace(/'/g, "''")}'`;
        }).join(', ');
        return `INSERT INTO ${tn} (${colList}) VALUES (${valList});`;
      });
    copyToClipboard(inserts.join('\n'));
    showToast(`${selectedRows.size} INSERTs copiados`, 'success');
  };

  // --- Context Menu ---
  const handleContextMenu = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx });
  };

  // --- Grid keyboard shortcuts ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Arrow keys → navigate cells (only when not editing and not in editor)
      if (!ctrl && !e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).closest?.('.monaco-editor'))) return;

        if (focusedCell && activeTab.result?.Rows) {
          e.preventDefault();
          const maxRow = activeTab.result.Rows.length - 1;
          const maxCol = (activeTab.result.Columns?.length || 1) - 1;
          let { rowIdx, colIdx } = focusedCell;

          if (e.key === 'ArrowUp') rowIdx = Math.max(0, rowIdx - 1);
          else if (e.key === 'ArrowDown') rowIdx = Math.min(maxRow, rowIdx + 1);
          else if (e.key === 'ArrowLeft') colIdx = Math.max(0, colIdx - 1);
          else if (e.key === 'ArrowRight') colIdx = Math.min(maxCol, colIdx + 1);

          setFocusedCell({ rowIdx, colIdx });

          if (e.shiftKey) {
            const cellKey = `${rowIdx}:${colIdx}`;
            setSelectedCells((prev) => {
              const next = new Set(prev);
              next.add(cellKey);
              return next;
            });
          } else {
            setSelectedCells(new Set([`${rowIdx}:${colIdx}`]));
          }
          setLastSelectedCell({ rowIdx, colIdx });

          // Scroll cell into view
          const cellEl = gridRef.current?.querySelector(`[data-cell="${rowIdx}:${colIdx}"]`);
          cellEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else if (activeTab.result?.Rows?.length && activeTab.result.Columns?.length) {
          // No focused cell yet — focus first cell
          e.preventDefault();
          setFocusedCell({ rowIdx: 0, colIdx: 0 });
          setSelectedCells(new Set(['0:0']));
          setLastSelectedCell({ rowIdx: 0, colIdx: 0 });
        }
        return;
      }

      if (!ctrl) return;

      // Ctrl+Shift+C → special copy dialog
      if (e.shiftKey && e.key === 'C') {
        if (activeTab.result && activeTab.result.Rows && activeTab.result.Rows.length > 0) {
          e.preventDefault();
          setCopySpecialOpen(true);
        }
        return;
      }

      // Ctrl+C → copy
      if (e.key === 'c' && !e.shiftKey) {
        const sel = window.getSelection()?.toString();
        if (sel) return;

        if (selectedCells.size > 0 && activeTab.result) {
          e.preventDefault();
          const rows = activeTab.result.Rows || [];
          const lines: string[] = [];
          const cellArray = Array.from(selectedCells).map((k) => { const [r, c] = k.split(':').map(Number); return { r, c }; });
          const minRow = Math.min(...cellArray.map((c) => c.r));
          const maxRow = Math.max(...cellArray.map((c) => c.r));
          const minCol = Math.min(...cellArray.map((c) => c.c));
          const maxCol = Math.max(...cellArray.map((c) => c.c));
          for (let r = minRow; r <= maxRow; r++) {
            const cells: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              if (selectedCells.has(`${r}:${c}`)) {
                const v = rows[r]?.[c];
                cells.push(v === null ? 'NULL' : String(v));
              } else {
                cells.push('');
              }
            }
            lines.push(cells.join('\t'));
          }
          copyToClipboard(lines.join('\n'));
          showToast(`${selectedCells.size} celulas copiadas`, 'success');
        } else if (selectedColumns.size > 0 && activeTab.result) {
          e.preventDefault();
          const cols = activeTab.result.Columns || [];
          const rows = activeTab.result.Rows || [];
          const colIndices = Array.from(selectedColumns).sort((a, b) => a - b);
          const lines = rows.map((row) => colIndices.map((ci) => row[ci] === null ? 'NULL' : String(row[ci])).join('\t'));
          copyToClipboard(lines.join('\n'));
          showToast(`${selectedColumns.size} colunas copiadas`, 'success');
        } else if (selectedRows.size > 0) {
          e.preventDefault();
          handleCopySelectedRows();
        } else if (focusedCell && activeTab.result) {
          e.preventDefault();
          const val = activeTab.result.Rows?.[focusedCell.rowIdx]?.[focusedCell.colIdx];
          copyToClipboard(val !== null && val !== undefined ? String(val) : '');
          showToast('Celula copiada', 'success');
        }
        return;
      }

      // Ctrl+A → select all rows
      if (e.key === 'a' && !e.shiftKey) {
        if (activeTab.result?.Rows && activeTab.result.Rows.length > 0) {
          e.preventDefault();
          setSelectedRows(new Set(activeTab.result.Rows.map((_, i) => i)));
          setSelectedCells(new Set());
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedRows, selectedColumns, selectedCells, focusedCell, activeTab.result]);

  // --- Auto-detect table name from query ---
  useEffect(() => {
    const tn = extractTableName(activeTab.query);
    setTableName(tn);
  }, [activeTab.query]);

  // F3 para abrir queries salvas
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        e.stopPropagation();
        setIsSavedQueriesOpen(true);
      }
      if (e.key === 'F2' && !renamingTabId) {
        e.preventDefault();
        e.stopPropagation();
        startRenameTab(activeTabIdRef.current);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [renamingTabId]);

  // --- Edit cell value display ---
  const getCellDisplayValue = (rowIdx: number, colIdx: number, originalValue: any): any => {
    const key = `${rowIdx}-${colIdx}`;
    return editedCells.has(key) ? editedCells.get(key) : originalValue;
  };

  const isCellChanged = (rowIdx: number, colIdx: number) => {
    return editedCells.has(`${rowIdx}-${colIdx}`);
  };

  const handleCommit = async () => {
    if (!activeTab.connection) return;
    try {
      await Commit(activeTab.connection);
      updateTab(activeTabId, { error: null, hasChanges: false, pendingTransactions: 0 });
    } catch (err) {
      updateTab(activeTabId, { error: `Erro ao fazer commit: ${err}` });
    }
  };

  const handleRollback = async () => {
    if (!activeTab.connection) return;
    try {
      await Rollback(activeTab.connection);
      updateTab(activeTabId, { error: null, hasChanges: false, pendingTransactions: 0 });
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

  const handleCloseOtherTabs = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id === id);
      if (!prev.find((t) => t.id === activeTabId && t.id === id)) {
        setActiveTabId(id);
      }
      return next;
    });
  };

  const handleCloseRightTabs = (id: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.slice(0, idx + 1);
      if (!next.find((t) => t.id === activeTabId)) {
        setActiveTabId(id);
      }
      return next;
    });
  };

  const handleDuplicateTab = (id: string) => {
    const src = tabs.find((t) => t.id === id);
    if (!src) return;
    const dup = createTab(src.connection);
    dup.query = src.query;
    dup.title = src.title + ' (cópia)';
    dup.originalQuery = src.originalQuery;
    setTabs((prev) => [...prev, dup]);
    setActiveTabId(dup.id);
  };

  const startRenameTab = (id: string) => {
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    setRenamingTabId(id);
    setRenameValue(tab.title);
  };

  const confirmRenameTab = () => {
    if (renamingTabId && renameValue.trim()) {
      updateTab(renamingTabId, { title: renameValue.trim() });
    }
    setRenamingTabId(null);
  };

  return (
    <div className="h-screen flex flex-col bg-app-bg text-zinc-100 select-none" style={{ fontSize: settings.uiFontSize + 'px' }}>
      {/* Header */}
      <header className="h-10 bg-app-surface border-b border-app-border flex items-center px-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-accent-blue rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
              <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
              <path d="M9 13h6M9 17h4" />
            </svg>
          </div>
          <span className="font-semibold text-sm">The Amzg DB</span>
        </div>
        <div className="flex-1" />
        {activeConnection && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-accent-green" />
            <span className="text-zinc-400 text-xs">{activeConnection}</span>
            <button
              onClick={handleDisconnect}
              className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 transition-colors"
              title="Desconectar"
            >
              <Unplug size={12} />
            </button>
          </div>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-7 h-7 rounded flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors ml-2"
          title="Configuracoes"
        >
          <Settings size={14} />
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className={`${sidebarCollapsed ? 'w-10' : 'w-60'} bg-app-surface border-r border-app-border flex flex-col shrink-0 transition-all duration-200 overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-app-border shrink-0 h-10">
            {!sidebarCollapsed && (
              <span className="text-[0.83em] font-medium text-zinc-500 uppercase tracking-wider pl-2">Database</span>
            )}
            <div className={`flex items-center gap-1 ${sidebarCollapsed ? 'px-1.5' : 'pr-2'}`}>
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="w-5 h-5 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 transition-colors"
                title={sidebarCollapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
              >
                {sidebarCollapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={12} />}
              </button>
              {!sidebarCollapsed && (
                <>
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
                    disabled={projects.length === 0}
                    className="w-5 h-5 rounded bg-app-elevated hover:bg-accent-blue/20 hover:text-accent-blue flex items-center justify-center text-zinc-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-app-elevated disabled:hover:text-zinc-400"
                    title={projects.length === 0 ? 'Crie um projeto primeiro' : 'Nova Conexao'}
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 1v10M 1 6h10" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center py-2 gap-2">
                {projects.map((project) => (
                  <div key={project.Name} className="flex flex-col items-center gap-1">
                    <div
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: project.Color || '#3b82f6' }}
                      title={project.Name}
                    />
                    {project.Connections?.map((conn) => (
                      <div
                        key={conn.Name}
                        className="w-2 h-2 rounded-full shrink-0 cursor-pointer hover:ring-1 hover:ring-white/30 transition-all"
                        style={{ backgroundColor: conn.Color || '#22c55e' }}
                        title={conn.Name}
                        onClick={() => {
                          if (activeConnection === conn.Name) handleDisconnect();
                          else handleConnect(conn);
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-1">
                {projects.length > 0 ? (
                  projects.map((project) => {
                    const isExpanded = expandedProjects.has(project.Name);
                    return (
                      <div key={project.Name} className="group">
                        <div
                          className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[0.917em] hover:bg-app-hover text-zinc-300 cursor-pointer"
                          onClick={() => {
                            setExpandedProjects(prev => {
                              const next = new Set(prev);
                              if (next.has(project.Name)) next.delete(project.Name);
                              else next.add(project.Name);
                              return next;
                            });
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setProjContextMenu({ x: e.clientX, y: e.clientY, project });
                          }}
                        >
                          <ChevronRight
                            size={10}
                            className={`shrink-0 text-zinc-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          />
                          <div
                            className="w-2.5 h-2.5 shrink-0"
                            style={{ color: project.Color || '#3b82f6' }}
                          >
                            <Folder size={12} fill="currentColor" />
                          </div>
                          <span className="font-medium truncate flex-1">{project.Name}</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingProject(project); setIsProjectDialogOpen(true); }}
                            className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Editar projeto"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.Name); }}
                            className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Remover projeto"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        </div>
                        {isExpanded && project.Connections?.map((conn) => (
                          <div key={conn.Name} className="group">
                            <div
                              className={`w-full text-left pl-9 pr-2.5 py-1.5 flex items-center gap-2 transition-colors text-[0.917em] border-l-2 cursor-pointer ${
                                activeConnection === conn.Name
                                  ? 'bg-accent-blue/10 text-white border-l-accent-blue'
                                  : 'hover:bg-app-hover text-zinc-300 hover:text-white border-l-transparent'
                              }`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (activeConnection === conn.Name) {
                                  handleDisconnect();
                                } else {
                                  handleConnect(conn);
                                }
                              }}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setConnContextMenu({ x: e.clientX, y: e.clientY, conn });
                              }}
                            >
                              <ChevronRight
                                size={9}
                                className={`shrink-0 text-zinc-500 transition-transform ${activeConnection === conn.Name ? 'rotate-90' : ''}`}
                              />
                              <Database size={11} className="shrink-0" style={{ color: conn.Color || '#22c55e' }} />
                              <span className="font-medium truncate flex-1">{conn.Name}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleEditConnection(conn); }}
                                className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Editar conexao"
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteConnection(conn.Name); }}
                                className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Remover conexao"
                              >
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                            {activeConnection === conn.Name && (
                              <div className="pl-9 bg-app-bg/30 animate-fade-in">
                                <SchemaTree
                                  connectionName={conn.Name}
                                  onTableSelect={handleTableSelect}
                                  onOpenQuery={handleOpenQueryFromTree}
                                  onShowDefinition={handleShowDefinition}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-center text-[0.917em] text-zinc-600">
                    Crie um projeto para adicionar conexoes
                  </div>
                )}
              </div>
            )}
          </div>

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
                  <div
                    key={tab.id}
                    onClick={() => setActiveTabId(tab.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setActiveTabId(tab.id);
                      setTabContextMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
                    }}
                    onDoubleClick={() => startRenameTab(tab.id)}
                    className={`group relative h-full px-3 flex items-center gap-1.5 text-[0.917em] border-r border-app-border shrink-0 transition-colors cursor-default ${
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
                    {renamingTabId === tab.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={confirmRenameTab}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') confirmRenameTab();
                          if (e.key === 'Escape') setRenamingTabId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="max-w-[120px] bg-app-elevated border border-accent-blue rounded px-1 text-[0.917em] text-white outline-none"
                      />
                    ) : (
                      <span className="max-w-[120px] truncate">{tab.title}</span>
                    )}
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
                  </div>
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
              className="h-7 px-3 bg-accent-green hover:bg-accent-green/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-[0.917em] font-medium text-white flex items-center gap-1 transition-colors"
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
            <span className="text-[0.83em] text-zinc-600 font-mono">Ctrl+Enter</span>

            {/* Save Query */}
            <button
              onClick={handleSaveQuery}
              disabled={!activeTab.query.trim()}
              className="h-7 px-2 bg-app-bg hover:bg-app-elevated disabled:opacity-40 disabled:cursor-not-allowed rounded text-[0.917em] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
              title="Salvar query"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Salvar
            </button>

            {/* Load Query Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsSavedQueriesOpen(!isSavedQueriesOpen)}
                className="h-7 px-2 bg-app-bg hover:bg-app-elevated rounded text-[0.917em] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
                title="Carregar query salva"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Carregar
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isSavedQueriesOpen && (
                <div className="absolute top-full left-0 mt-1 w-80 max-h-72 overflow-y-auto bg-app-surface border border-app-border rounded shadow-lg z-50">
                  {savedQueries.length === 0 ? (
                    <div className="px-3 py-2 text-[0.917em] text-zinc-500">Nenhuma query salva</div>
                  ) : (
                    savedQueries.map((sq) => {
                      const project = projects.find((p) => p.Connections?.some((c) => c.Name === sq.Connection));
                      return (
                        <div
                          key={sq.Name}
                          className="group flex items-center gap-2.5 px-3 py-2 hover:bg-app-hover cursor-pointer"
                          onClick={() => handleLoadSavedQuery(sq)}
                        >
                          {project && (
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: project.Color || '#3b82f6' }}
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-[1em] text-zinc-200 font-medium truncate">{sq.Name}</div>
                            <div className="text-[0.83em] text-zinc-500 truncate font-mono mt-0.5">{sq.Query}</div>
                          </div>
                          {project && (
                            <span className="text-[0.83em] text-zinc-500 shrink-0">{project.Name}</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSavedQuery(sq.Name); }}
                            className="w-4 h-4 rounded flex items-center justify-center text-zinc-500 hover:text-accent-red hover:bg-accent-red/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                            title="Remover"
                          >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M1 1l6 6M7 1l-6 6" />
                            </svg>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

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
                      className={`px-1.5 py-0.5 rounded text-[0.75em] font-medium transition-colors ${
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
                      className="h-6 px-2 bg-accent-green/20 hover:bg-accent-green/30 text-accent-green rounded text-[0.83em] font-medium flex items-center gap-1 transition-colors"
                      title="Commit (Ctrl+Shift+C)"
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                      Commit
                      {transactionMode === 'manual' && activeTab.pendingTransactions > 0 && (
                        <span className="ml-0.5 px-1 py-0.5 bg-accent-green/30 rounded text-[0.667em]">
                          {activeTab.pendingTransactions}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => handleRollback()}
                      className="h-6 px-2 bg-accent-red/20 hover:bg-accent-red/30 text-accent-red rounded text-[0.83em] font-medium flex items-center gap-1 transition-colors"
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

            {/* Database/Schema switcher */}
            {activeTab.connection && databases.length > 0 && (
              <>
                <div className="h-3 w-px bg-app-border" />
                <div className="flex items-center gap-1.5">
                  <select
                    value={currentDatabase || ''}
                    onChange={(e) => setCurrentDatabase(e.target.value)}
                    className="h-6 px-1.5 bg-app-bg border border-app-border rounded text-[0.83em] text-zinc-300 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors max-w-[120px]"
                    title="Banco de dados ativo"
                  >
                    {databases.map((db) => (
                      <option key={db} value={db}>{db}</option>
                    ))}
                  </select>
                  {schemas.length > 0 && (
                    <select
                      value={currentSchema || ''}
                      onChange={(e) => setCurrentSchema(e.target.value)}
                      className="h-6 px-1.5 bg-app-bg border border-app-border rounded text-[0.83em] text-zinc-300 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors max-w-[120px]"
                      title="Schema ativo"
                    >
                      {schemas.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            <div className="flex-1" />
            {activeTab.result && (
              <span className="text-[0.83em] text-zinc-500">
                {activeTab.result.RowCount} rows {activeTab.result.Duration ? `${activeTab.result.Duration}ms` : ''}
              </span>
            )}
          </div>

          {/* SQL Editor */}
          <div className="h-48 border-b border-app-border shrink-0">
            <SqlEditor
              key={activeTab.id}
              ref={editorRef}
              value={activeTab.query}
              onChange={(val) => updateTab(activeTabId, { query: val })}
              onExecute={() => handleExecuteQuery()}
              onExecuteAll={() => handleExecuteAll()}
              onSave={() => handleQuickSave()}
            />
          </div>

          {/* Error */}
          {activeTab.error && (
            <div className="mx-2 mt-2 px-2.5 py-1.5 bg-accent-red/10 border border-accent-red/20 rounded text-accent-red text-[0.917em] flex items-center gap-2 animate-fade-in">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              {activeTab.error}
            </div>
          )}

          {/* Results */}
          <div
            ref={(el) => { gridRef.current = el; resultsContainerRef.current = el; }}
            className="flex-1 overflow-auto relative"
            onScroll={handleResultsScroll}
          >
            {activeTab.result && activeTab.result.Columns && activeTab.result.Columns.length > 0 ? (
              <div className="min-w-full">
                <table className="w-full text-[0.917em]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-app-surface border-b border-app-border">
                      <th onClick={handleSelectAll} className="w-8 px-1 py-1.5 text-right text-[0.83em] text-zinc-600 font-medium sticky left-0 bg-app-surface z-20 cursor-pointer select-none hover:text-zinc-300">#</th>
                      {activeTab.result.Columns?.map((col: string, colIdx: number) => (
                        <th
                          key={col}
                          onClick={(e) => handleColumnClick(colIdx, e)}
                          className={`px-2.5 py-1.5 text-left text-[0.83em] font-medium whitespace-nowrap cursor-pointer select-none transition-colors ${
                            selectedColumns.has(colIdx)
                              ? 'bg-accent-blue/20 text-white'
                              : 'text-zinc-400 hover:bg-app-hover hover:text-zinc-200'
                          }`}
                        >
                          <div>{col}</div>
                          {activeTab.result?.ColumnTypes?.[colIdx] && (
                            <div className="text-[0.75em] text-zinc-600 font-normal normal-case">{activeTab.result.ColumnTypes[colIdx]}</div>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border/30">
                    {activeTab.result.Rows?.map((row: any[], rowIdx: number) => (
                      <tr
                        key={rowIdx}
                        className={`transition-colors ${
                          selectedRows.has(rowIdx)
                            ? 'bg-accent-blue/20 hover:bg-accent-blue/25'
                            : 'hover:bg-app-hover/30'
                        }`}
                        onClick={(e) => handleRowClick(rowIdx, e)}
                      >
                        <td
                          className="w-8 px-1 py-1 text-right text-[0.83em] text-zinc-600 sticky left-0 bg-app-bg z-10 cursor-pointer select-none"
                          onClick={(e) => { e.stopPropagation(); handleRowClick(rowIdx, e); }}
                        >
                          {rowIdx + 1}
                        </td>
                        {row.map((cell: any, cellIdx: number) => {
                          const displayValue = getCellDisplayValue(rowIdx, cellIdx, cell);
                          const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === cellIdx;
                          const isChanged = isCellChanged(rowIdx, cellIdx);
                          const isFocused = focusedCell?.rowIdx === rowIdx && focusedCell?.colIdx === cellIdx;
                          const isColSelected = selectedColumns.has(cellIdx);
                          const isCellSelected = selectedCells.has(`${rowIdx}:${cellIdx}`);

                          return (
                            <td
                              key={cellIdx}
                              data-cell={`${rowIdx}:${cellIdx}`}
                              className={`px-2.5 py-1 text-[0.917em] whitespace-nowrap cursor-default ${
                                isChanged ? 'bg-yellow-500/10' : ''
                              } ${isFocused ? 'ring-1 ring-accent-blue/50 ring-inset' : ''} ${
                                isCellSelected ? 'bg-accent-blue/20' : ''
                              } ${
                                isColSelected && !isFocused && !isCellSelected ? 'bg-accent-blue/10' : ''
                              }`}
                              onDoubleClick={() => handleCellDoubleClick(rowIdx, cellIdx, cell)}
                              onClick={(e) => handleCellClick(rowIdx, cellIdx, e)}
                              onContextMenu={(e) => handleContextMenu(e, rowIdx, cellIdx)}
                            >
                              {isEditing ? (
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={handleEditKeyDown}
                                  onBlur={saveEdit}
                                  className="w-full min-w-[60px] px-1 py-0.5 bg-app-bg border border-accent-blue rounded text-[0.917em] text-zinc-100 outline-none"
                                />
                              ) : displayValue !== null && displayValue !== undefined ? (
                                <span className={isChanged ? 'text-yellow-300' : 'text-zinc-200'}>{String(displayValue)}</span>
                              ) : (
                                <span className="text-zinc-600 italic font-mono text-[0.83em]">NULL</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Load More / Load All bar */}
                {activeTab.result.Rows && activeTab.result.Rows.length > 0 && (
                  <div className="sticky bottom-0 bg-app-surface border-t border-app-border px-3 py-1.5 flex items-center justify-between text-[0.83em]">
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-500">
                        Mostrando {activeTab.result.Rows.length} linhas
                        {activeTab.hasMoreRows ? ' (mais disponíveis)' : ''}
                      </span>
                      {(editingCell || editedCells.size > 0) && (
                        <span className="text-accent-yellow">
                          Editando — Enter para salvar, Esc para cancelar
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {editingCell && (
                        <>
                          <button
                            onClick={cancelEdit}
                            className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated text-zinc-400 rounded transition-colors"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={saveEdit}
                            className="px-2 py-0.5 bg-accent-green/20 hover:bg-accent-green/30 text-accent-green rounded font-medium transition-colors"
                          >
                            Salvar (Enter)
                          </button>
                        </>
                      )}
                      {activeTab.isLoadingMore && (
                        <span className="text-accent-blue flex items-center gap-1">
                          <svg className="animate-spin" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" strokeDasharray="31.42" strokeDashoffset="10" />
                          </svg>
                          Carregando mais linhas...
                        </span>
                      )}
                      {activeTab.hasMoreRows && !activeTab.isLoadingMore && (
                        <button
                          onClick={handleLoadMore}
                          className="px-2 py-0.5 bg-app-bg hover:bg-app-elevated text-zinc-400 rounded transition-colors"
                        >
                          Carregar mais
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (confirm('Carregar todas as linhas? Isso pode ser lento para grandes resultados.')) {
                            handleLoadAll();
                          }
                        }}
                        disabled={activeTab.isLoading}
                        className="px-2 py-0.5 bg-accent-blue/20 hover:bg-accent-blue/30 text-accent-blue rounded transition-colors disabled:opacity-50"
                      >
                        {activeTab.isLoading ? 'Carregando...' : 'Carregar tudo'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab.result ? (
              <div className="p-3 text-center text-zinc-500 text-[0.917em]">
                {activeTab.result.Message}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600">
                <div className="text-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-2 text-zinc-700">
                    <path d="M4 7c0-1.1.9-2 2-2h8l4 4v10c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V7z" />
                    <path d="M9 13h6M9 17h4" />
                  </svg>
                  <p className="text-[0.917em]">Execute uma query para ver os resultados</p>
                  <p className="text-[0.83em] text-zinc-700 mt-0.5">Ctrl+Enter para executar</p>
                </div>
              </div>
            )}

            {/* Selection Toolbar */}
            {(selectedRows.size > 0 || selectedColumns.size > 0 || selectedCells.size > 0) && activeTab.result && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-app-surface border border-app-border rounded-lg shadow-xl px-3 py-2 flex items-center gap-3 text-[0.917em] animate-fade-in">
                {selectedRows.size > 0 && <span className="text-zinc-300 font-medium">{selectedRows.size} linhas</span>}
                {selectedRows.size > 0 && selectedColumns.size > 0 && <div className="h-4 w-px bg-app-border" />}
                {selectedColumns.size > 0 && <span className="text-zinc-300 font-medium">{selectedColumns.size} colunas</span>}
                {(selectedRows.size > 0 || selectedColumns.size > 0) && selectedCells.size > 0 && <div className="h-4 w-px bg-app-border" />}
                {selectedCells.size > 0 && <span className="text-zinc-300 font-medium">{selectedCells.size} celulas</span>}
                <div className="h-4 w-px bg-app-border" />
                {selectedCells.size > 0 && (
                  <button
                    onClick={() => {
                      const rows = activeTab.result?.Rows || [];
                      const cellArray = Array.from(selectedCells).map((k) => { const [r, c] = k.split(':').map(Number); return { r, c }; });
                      const minCol = Math.min(...cellArray.map((c) => c.c));
                      const maxCol = Math.max(...cellArray.map((c) => c.c));
                      const minRow = Math.min(...cellArray.map((c) => c.r));
                      const maxRow = Math.max(...cellArray.map((c) => c.r));
                      const lines: string[] = [];
                      for (let r = minRow; r <= maxRow; r++) {
                        const cells: string[] = [];
                        for (let c = minCol; c <= maxCol; c++) {
                          if (selectedCells.has(`${r}:${c}`)) {
                            const v = rows[r]?.[c];
                            cells.push(v === null ? 'NULL' : String(v));
                          } else {
                            cells.push('');
                          }
                        }
                        lines.push(cells.join('\t'));
                      }
                      copyToClipboard(lines.join('\n'));
                      showToast(`${selectedCells.size} celulas copiadas`, 'success');
                    }}
                    className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                  >
                    Copiar celulas
                  </button>
                )}
                {selectedRows.size > 0 && (
                  <button
                    onClick={handleCopySelectedRowsToolbar}
                    className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                  >
                    Copiar linhas
                  </button>
                )}
                {selectedColumns.size > 0 && (
                  <button
                    onClick={() => {
                      const colIndices = Array.from(selectedColumns).sort((a, b) => a - b);
                      const lines = (activeTab.result?.Rows || []).map((r) => colIndices.map((ci) => r[ci] === null ? 'NULL' : String(r[ci])).join('\t'));
                      copyToClipboard(lines.join('\n'));
                      showToast(`${selectedColumns.size} colunas copiadas`, 'success');
                    }}
                    className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                  >
                    Copiar colunas
                  </button>
                )}
                {selectedRows.size > 0 && (
                  <button
                    onClick={handleCopySelectedAsInsertToolbar}
                    className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                  >
                    Copiar como INSERT
                  </button>
                )}
                <button
                  onClick={() => { setSelectedRows(new Set()); setSelectedColumns(new Set()); }}
                  className="px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:bg-app-elevated rounded transition-colors"
                >
                  Limpar
                </button>
              </div>
            )}

            {/* Grid Context Menu */}
            {contextMenu && (
              <ContextMenu
                x={contextMenu.x}
                y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                items={[
                  { label: 'Copiar celula', onClick: handleCopyCell },
                  { label: 'Copiar linha', onClick: handleCopyRow },
                  { label: 'Copiar coluna', onClick: () => {
                    if (!activeTab.result) return;
                    const colIdx = contextMenu.colIdx;
                    const lines = (activeTab.result.Rows || []).map((r) => r[colIdx] === null ? 'NULL' : String(r[colIdx]));
                    copyToClipboard(lines.join('\n'));
                    showToast('Coluna copiada', 'success');
                  }},
                  { label: 'Copiar linhas selecionadas', onClick: handleCopySelectedRows, disabled: selectedRows.size === 0 },
                  { label: 'Copiar colunas selecionadas', onClick: () => {
                    if (!activeTab.result) return;
                    const colIndices = Array.from(selectedColumns).sort((a, b) => a - b);
                    const lines = (activeTab.result.Rows || []).map((r) => colIndices.map((ci) => r[ci] === null ? 'NULL' : String(r[ci])).join('\t'));
                    copyToClipboard(lines.join('\n'));
                    showToast(`${selectedColumns.size} colunas copiadas`, 'success');
                  }, disabled: selectedColumns.size === 0 },
                  { separator: true },
                  { label: 'Copiar como INSERT', onClick: handleCopyAsInsert },
                  { label: 'Copiar especial...', shortcut: 'Ctrl+Shift+C', onClick: () => setCopySpecialOpen(true) },
                  { separator: true },
                  { label: 'Selecionar todas', onClick: handleSelectAll },
                ]}
              />
            )}

            {/* Tab Context Menu */}
            {tabContextMenu && (
              <ContextMenu
                x={tabContextMenu.x}
                y={tabContextMenu.y}
                onClose={() => setTabContextMenu(null)}
                items={[
                  { label: 'Renomear', shortcut: 'F2', onClick: () => startRenameTab(tabContextMenu.tabId) },
                  { label: 'Salvar', shortcut: 'Ctrl+S', onClick: handleQuickSave },
                  { separator: true },
                  { label: 'Fechar', onClick: () => handleCloseTab(tabContextMenu.tabId), disabled: tabs.length === 1 },
                  { label: 'Fechar outras', onClick: () => handleCloseOtherTabs(tabContextMenu.tabId), disabled: tabs.length <= 1 },
                  { label: 'Fechar a direita', onClick: () => handleCloseRightTabs(tabContextMenu.tabId) },
                  { separator: true },
                  { label: 'Duplicar em nova aba', onClick: () => handleDuplicateTab(tabContextMenu.tabId) },
                ]}
              />
            )}

            {/* Connection Context Menu */}
            {connContextMenu && (
              <ContextMenu
                x={connContextMenu.x}
                y={connContextMenu.y}
                onClose={() => setConnContextMenu(null)}
                items={[
                  {
                    label: activeConnection === connContextMenu.conn.Name ? 'Desconectar' : 'Conectar',
                    onClick: () => {
                      if (activeConnection === connContextMenu.conn.Name) handleDisconnect();
                      else handleConnect(connContextMenu.conn);
                    },
                  },
                  { label: 'Editar', onClick: () => handleEditConnection(connContextMenu.conn) },
                  { label: 'Testar conexao', onClick: async () => {
                    try {
                      await TestConnection(connContextMenu.conn);
                      showToast('Conexao testada com sucesso', 'success');
                    } catch (err) {
                      showToast(`Erro ao testar: ${err}`, 'error');
                    }
                  }},
                  { separator: true },
                  {
                    label: 'Scripts recentes',
                    children: savedQueries.filter((sq) => sq.Connection === connContextMenu.conn.Name).length > 0
                      ? savedQueries
                          .filter((sq) => sq.Connection === connContextMenu.conn.Name)
                          .map((sq) => ({
                            label: sq.Name,
                            onClick: () => handleLoadSavedQuery(sq),
                          }))
                      : [{ label: 'Nenhum script salvo', disabled: true, onClick: () => {} }],
                  },
                  { separator: true },
                  { label: 'Copiar nome', onClick: () => { navigator.clipboard.writeText(connContextMenu.conn.Name); showToast('Nome copiado', 'success'); } },
                  { separator: true },
                  { label: 'Remover', onClick: () => handleDeleteConnection(connContextMenu.conn.Name) },
                ]}
              />
            )}

            {/* Project Context Menu */}
            {projContextMenu && (
              <ContextMenu
                x={projContextMenu.x}
                y={projContextMenu.y}
                onClose={() => setProjContextMenu(null)}
                items={[
                  { label: 'Editar', onClick: () => { setEditingProject(projContextMenu.project); setIsProjectDialogOpen(true); } },
                  { label: 'Nova conexao', onClick: () => { setEditingProject(null); setIsDialogOpen(true); } },
                  {
                    label: 'Scripts recentes',
                    children: (() => {
                      const connNames = new Set(projContextMenu.project.Connections?.map((c) => c.Name) || []);
                      const projectQueries = savedQueries.filter((sq) => connNames.has(sq.Connection));
                      return projectQueries.length > 0
                        ? projectQueries.map((sq) => ({
                            label: sq.Name,
                            onClick: () => handleLoadSavedQuery(sq),
                          }))
                        : [{ label: 'Nenhum script salvo', disabled: true, onClick: () => {} }];
                    })(),
                  },
                  { separator: true },
                  { label: 'Exportar projeto', onClick: () => handleExportProject(projContextMenu.project.Name) },
                  { label: 'Importar projeto', onClick: handleImportProject },
                  { separator: true },
                  { label: 'Remover', onClick: () => handleDeleteProject(projContextMenu.project.Name) },
                ]}
              />
            )}

            {/* Copy Special Modal */}
            {copySpecialOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setCopySpecialOpen(false)}>
                <div className="bg-app-surface border border-app-border rounded-xl shadow-2xl p-4 w-80 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-sm font-semibold text-zinc-200 mb-3">Copiar Especial</h3>
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-[0.917em] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={copySpecialConfig.includeHeaders}
                        onChange={(e) => setCopySpecialConfig((p) => ({ ...p, includeHeaders: e.target.checked }))}
                        className="rounded border-zinc-600 bg-app-bg text-accent-blue focus:ring-accent-blue"
                      />
                      Incluir cabecalho
                    </label>
                    <div>
                      <label className="text-[0.917em] text-zinc-400 block mb-1">Delimitador</label>
                      <div className="flex gap-1">
                        {[
                          { label: 'Tab', value: '\t' },
                          { label: ',', value: ',' },
                          { label: ';', value: ';' },
                          { label: '|', value: '|' },
                          { label: 'Custom', value: 'custom' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setCopySpecialConfig((p) => ({ ...p, delimiter: opt.value }))}
                            className={`px-2 py-1 text-[0.83em] rounded border transition-colors ${
                              copySpecialConfig.delimiter === opt.value
                                ? 'bg-accent-blue/20 border-accent-blue text-white'
                                : 'border-app-border text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      {copySpecialConfig.delimiter === 'custom' && (
                        <input
                          autoFocus
                          value={copySpecialConfig.customDelimiter}
                          onChange={(e) => setCopySpecialConfig((p) => ({ ...p, customDelimiter: e.target.value }))}
                          placeholder="Digite o delimitador"
                          className="mt-1 w-full px-2 py-1 bg-app-bg border border-app-border rounded text-[0.917em] text-zinc-200 outline-none focus:border-accent-blue"
                        />
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-[0.917em] text-zinc-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={copySpecialConfig.quoteStrings}
                        onChange={(e) => setCopySpecialConfig((p) => ({ ...p, quoteStrings: e.target.checked }))}
                        className="rounded border-zinc-600 bg-app-bg text-accent-blue focus:ring-accent-blue"
                      />
                      Aspas em strings
                    </label>
                    {selectedRows.size > 0 && (
                      <div className="text-[0.83em] text-zinc-500">
                        Copiando {selectedRows.size} linhas selecionadas
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <button
                      onClick={() => setCopySpecialOpen(false)}
                      className="px-3 py-1.5 text-[0.917em] text-zinc-400 hover:text-zinc-200 rounded border border-app-border hover:border-zinc-500 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCopySpecial}
                      className="px-3 py-1.5 text-[0.917em] text-white bg-accent-blue hover:bg-accent-blue/80 rounded transition-colors"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Toast Notifications */}
            <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2">
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className={`px-3 py-2 rounded-lg shadow-xl text-[0.917em] font-medium animate-fade-in ${
                    toast.type === 'success'
                      ? 'bg-accent-green/20 text-accent-green border border-accent-green/30'
                      : 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                  }`}
                >
                  {toast.message}
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Status Bar */}
      <footer className="h-7 bg-app-surface border-t border-app-border flex items-center px-3 text-[0.917em] shrink-0">
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
        <span className="text-zinc-600">The Amzg DB v0.1.1</span>
      </footer>

      {/* Connection Dialog */}
      <ConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => { setIsDialogOpen(false); setEditingConfig(null); }}
        onSave={() => { loadProjects(); loadConnections(); }}
        editConfig={editingConfig || undefined}
        projects={projects}
      />

      {/* Project Dialog */}
      <ProjectDialog
        isOpen={isProjectDialogOpen}
        onClose={() => { setIsProjectDialogOpen(false); setEditingProject(null); }}
        onSave={() => { loadProjects(); loadConnections(); }}
        editProject={editingProject || undefined}
      />

      {/* Variable Modal */}
      <VariableModal
        isOpen={variableModalOpen}
        variables={detectedVariables}
        onClose={() => { setVariableModalOpen(false); setPendingQuery(null); }}
        onExecute={handleVariableExecute}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
