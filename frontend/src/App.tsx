import { useState, useEffect, useRef, useCallback } from 'react';
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
  GetDatabases,
  GetSchemas,
  SaveSavedQuery,
  RemoveSavedQuery,
  GetSavedQueries,
  ExecuteQueryPaginated,
  ExtractSQLVariables,
  ReplaceSQLVariables,
} from '../wailsjs/go/main/App';
import { types, sqlvariables } from '../wailsjs/go/models';
import SchemaTree from './components/SchemaTree/SchemaTree';
import { Folder, ChevronRight, Database, Settings } from 'lucide-react';
import ConnectionDialog from './components/ConnectionDialog/ConnectionDialog';
import ProjectDialog from './components/ProjectDialog/ProjectDialog';
import SqlEditor, { SqlEditorHandle } from './components/SqlEditor/SqlEditor';
import VariableModal from './components/VariableModal/VariableModal';
import SettingsModal, { AppSettings } from './components/SettingsModal/SettingsModal';

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

  // --- SQL Variables ---
  const [variableModalOpen, setVariableModalOpen] = useState(false);
  const [detectedVariables, setDetectedVariables] = useState<sqlvariables.Variable[]>([]);
  const [pendingQuery, setPendingQuery] = useState<{ query: string; conn: string } | null>(null);

  // --- Settings ---
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('amzg-settings');
      return saved ? JSON.parse(saved) : { executeMode: 'statement', statementDelimiter: 'blank_line', autoExpandProject: false, confirmOnDelete: true, fontSize: 13 };
    } catch { return { executeMode: 'statement', statementDelimiter: 'blank_line', autoExpandProject: false, confirmOnDelete: true, fontSize: 13 }; }
  });

  // --- Editor Ref ---
  const editorRef = useRef<SqlEditorHandle>(null);

  // --- Grid Feature States ---
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<CellPos | null>(null);
  const [editValue, setEditValue] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [editedCells, setEditedCells] = useState<Map<string, any>>(new Map());
  const [focusedCell, setFocusedCell] = useState<CellPos | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tableName, setTableName] = useState<string | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeConnectionRef.current = activeConnection; }, [activeConnection]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

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
      if (isDML || isDDL) {
        resultPatch.hasChanges = true;
        if (transactionMode === 'manual') {
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

    const vars = await ExtractSQLVariables(queryToRun);
    if (vars.length > 0) {
      setDetectedVariables(vars);
      setPendingQuery({ query: queryToRun, conn });
      setVariableModalOpen(true);
      return;
    }

    await executeSQL(queryToRun, conn, targetId);
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

    const vars = await ExtractSQLVariables(queryToRun);
    if (vars.length > 0) {
      setDetectedVariables(vars);
      setPendingQuery({ query: queryToRun, conn });
      setVariableModalOpen(true);
      return;
    }

    await executeSQL(queryToRun, conn, targetId);
  };

  const handleVariableExecute = async (values: Record<string, string>) => {
    if (!pendingQuery) return;
    const replaced = await ReplaceSQLVariables(pendingQuery.query, values);
    await executeSQL(replaced, pendingQuery.conn, activeTabIdRef.current);
    setPendingQuery(null);
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

  const handleLoadSavedQuery = (sq: types.SavedQuery) => {
    updateTab(activeTabId, { query: sq.Query, title: sq.Name });
    if (sq.Connection && sq.Connection !== activeConnection) {
      const conn = [...projects.flatMap((p) => p.Connections || []), ...connections].find(
        (c) => c.Name === sq.Connection
      );
      if (conn) {
        handleConnect(conn);
      }
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

  const resultsContainerRef = useRef<HTMLDivElement>(null);

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
    }
    lastSelectedRow.current = rowIdx;
  };

  const handleCellDoubleClick = (rowIdx: number, colIdx: number, cellValue: any) => {
    setEditingCell({ rowIdx, colIdx });
    setEditValue(cellValue !== null ? String(cellValue) : '');
    setTimeout(() => editInputRef.current?.focus(), 0);
  };

  const handleCellClick = (rowIdx: number, colIdx: number) => {
    setFocusedCell({ rowIdx, colIdx });
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
    setContextMenu(null);
  };

  const handleCopyRow = () => {
    if (!contextMenu || !activeTab.result) return;
    const row = activeTab.result.Rows?.[contextMenu.rowIdx];
    if (row) copyToClipboard(row.map((c) => (c === null ? 'NULL' : String(c))).join('\t'));
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
  };

  // --- Context Menu ---
  const handleContextMenu = (e: React.MouseEvent, rowIdx: number, colIdx: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rowIdx, colIdx });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    document.addEventListener('contextmenu', handler);
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('contextmenu', handler);
    };
  }, [contextMenu]);

  // --- Ctrl+C keyboard shortcut ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const sel = window.getSelection()?.toString();
        if (sel) return; // let native copy work for text selection

        if (selectedRows.size > 0) {
          e.preventDefault();
          handleCopySelectedRows();
        } else if (focusedCell && activeTab.result) {
          e.preventDefault();
          const val = activeTab.result.Rows?.[focusedCell.rowIdx]?.[focusedCell.colIdx];
          copyToClipboard(val !== null && val !== undefined ? String(val) : '');
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedRows, focusedCell, activeTab.result]);

  // --- Auto-detect table name from query ---
  useEffect(() => {
    const tn = extractTableName(activeTab.query);
    setTableName(tn);
  }, [activeTab.query]);

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

  return (
    <div className="h-screen flex flex-col bg-app-bg text-zinc-100 select-none">
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
                disabled={projects.length === 0}
                className="w-5 h-5 rounded bg-app-elevated hover:bg-accent-blue/20 hover:text-accent-blue flex items-center justify-center text-zinc-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-app-elevated disabled:hover:text-zinc-400"
                title={projects.length === 0 ? 'Crie um projeto primeiro' : 'Nova Conexao'}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 1v10M1 6h10" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Projetos */}
            {projects.length > 0 ? (
              <div className="py-1">
                {projects.map((project) => {
                  const isExpanded = expandedProjects.has(project.Name);
                  return (
                    <div key={project.Name} className="group">
                      <div
                        className="w-full text-left px-2.5 py-1.5 flex items-center gap-2 text-[11px] hover:bg-app-hover text-zinc-300 cursor-pointer"
                        onClick={() => {
                          setExpandedProjects(prev => {
                            const next = new Set(prev);
                            if (next.has(project.Name)) next.delete(project.Name);
                            else next.add(project.Name);
                            return next;
                          });
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
                      {/* Conexoes do projeto */}
                      {isExpanded && project.Connections?.map((conn) => (
                        <div key={conn.Name} className="group">
                          <div
                            className={`w-full text-left pl-9 pr-2.5 py-1.5 flex items-center gap-2 transition-colors text-[11px] border-l-2 cursor-pointer ${
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
                          >
                            <ChevronRight
                              size={9}
                              className={`shrink-0 text-zinc-500 transition-transform ${activeConnection === conn.Name ? 'rotate-90' : ''}`}
                            />
                            <Database size={11} className="shrink-0" style={{ color: conn.Color || '#22c55e' }} />
                            <span className="font-medium truncate">{conn.Name}</span>
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
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-[11px] text-zinc-600">
                Crie um projeto para adicionar conexoes
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

            {/* Save Query */}
            <button
              onClick={handleSaveQuery}
              disabled={!activeTab.query.trim()}
              className="h-7 px-2 bg-app-bg hover:bg-app-elevated disabled:opacity-40 disabled:cursor-not-allowed rounded text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
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
                className="h-7 px-2 bg-app-bg hover:bg-app-elevated rounded text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
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
                <div className="absolute top-full left-0 mt-1 w-72 max-h-60 overflow-y-auto bg-app-surface border border-app-border rounded shadow-lg z-50">
                  {savedQueries.length === 0 ? (
                    <div className="px-3 py-2 text-[11px] text-zinc-500">Nenhuma query salva</div>
                  ) : (
                    savedQueries.map((sq) => (
                      <div
                        key={sq.Name}
                        className="group flex items-center gap-2 px-3 py-1.5 hover:bg-app-hover cursor-pointer"
                        onClick={() => handleLoadSavedQuery(sq)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] text-zinc-200 font-medium truncate">{sq.Name}</div>
                          <div className="text-[10px] text-zinc-500 truncate font-mono">{sq.Query}</div>
                        </div>
                        {sq.Connection && (
                          <span className="text-[9px] text-zinc-600 shrink-0">{sq.Connection}</span>
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
                    ))
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
                      {transactionMode === 'manual' && activeTab.pendingTransactions > 0 && (
                        <span className="ml-0.5 px-1 py-0.5 bg-accent-green/30 rounded text-[8px]">
                          {activeTab.pendingTransactions}
                        </span>
                      )}
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

            {/* Database/Schema switcher */}
            {activeTab.connection && databases.length > 0 && (
              <>
                <div className="h-3 w-px bg-app-border" />
                <div className="flex items-center gap-1.5">
                  <select
                    value={currentDatabase || ''}
                    onChange={(e) => setCurrentDatabase(e.target.value)}
                    className="h-6 px-1.5 bg-app-bg border border-app-border rounded text-[10px] text-zinc-300 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors max-w-[120px]"
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
                      className="h-6 px-1.5 bg-app-bg border border-app-border rounded text-[10px] text-zinc-300 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors max-w-[120px]"
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
              <span className="text-[10px] text-zinc-500">
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
          <div
            ref={resultsContainerRef}
            className="flex-1 overflow-auto relative"
            onScroll={handleResultsScroll}
          >
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
                        className={`transition-colors ${
                          selectedRows.has(rowIdx)
                            ? 'bg-accent-blue/20 hover:bg-accent-blue/25'
                            : 'hover:bg-app-hover/30'
                        }`}
                        onClick={(e) => handleRowClick(rowIdx, e)}
                      >
                        {row.map((cell: any, cellIdx: number) => {
                          const displayValue = getCellDisplayValue(rowIdx, cellIdx, cell);
                          const isEditing = editingCell?.rowIdx === rowIdx && editingCell?.colIdx === cellIdx;
                          const isChanged = isCellChanged(rowIdx, cellIdx);
                          const isFocused = focusedCell?.rowIdx === rowIdx && focusedCell?.colIdx === cellIdx;

                          return (
                            <td
                              key={cellIdx}
                              className={`px-2.5 py-1 text-[11px] whitespace-nowrap cursor-default ${
                                isChanged ? 'bg-yellow-500/10' : ''
                              } ${isFocused ? 'ring-1 ring-accent-blue/50 ring-inset' : ''}`}
                              onDoubleClick={() => handleCellDoubleClick(rowIdx, cellIdx, cell)}
                              onClick={(e) => { e.stopPropagation(); handleCellClick(rowIdx, cellIdx); }}
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
                                  className="w-full min-w-[60px] px-1 py-0.5 bg-app-bg border border-accent-blue rounded text-[11px] text-zinc-100 outline-none"
                                />
                              ) : displayValue !== null && displayValue !== undefined ? (
                                <span className={isChanged ? 'text-yellow-300' : 'text-zinc-200'}>{String(displayValue)}</span>
                              ) : (
                                <span className="text-zinc-600 italic font-mono text-[10px]">NULL</span>
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
                  <div className="sticky bottom-0 bg-app-surface border-t border-app-border px-3 py-1.5 flex items-center justify-between text-[10px]">
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

            {/* Selection Toolbar */}
            {selectedRows.size > 0 && activeTab.result && (
              <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 bg-app-surface border border-app-border rounded-lg shadow-xl px-3 py-2 flex items-center gap-3 text-[11px] animate-fade-in">
                <span className="text-zinc-300 font-medium">{selectedRows.size} linhas selecionadas</span>
                <div className="h-4 w-px bg-app-border" />
                <button
                  onClick={handleCopySelectedRowsToolbar}
                  className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                >
                  Copiar
                </button>
                <button
                  onClick={handleCopySelectedAsInsertToolbar}
                  className="px-2 py-1 bg-app-bg hover:bg-app-elevated text-zinc-300 hover:text-white rounded transition-colors"
                >
                  Copiar como INSERT
                </button>
                <button
                  onClick={() => setSelectedRows(new Set())}
                  className="px-2 py-1 text-zinc-500 hover:text-zinc-300 hover:bg-app-elevated rounded transition-colors"
                >
                  Limpar selecao
                </button>
              </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
              <div
                className="fixed z-50 bg-app-surface border border-app-border rounded-lg shadow-xl py-1 min-w-[200px] animate-fade-in"
                style={{ left: contextMenu.x, top: contextMenu.y }}
              >
                <button
                  onClick={handleCopyCell}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-app-hover hover:text-white flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copiar celula
                </button>
                <button
                  onClick={handleCopyRow}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-app-hover hover:text-white flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Copiar linha
                </button>
                <button
                  onClick={handleCopySelectedRows}
                  disabled={selectedRows.size === 0}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-app-hover hover:text-white flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copiar linhas selecionadas
                  {selectedRows.size > 0 && (
                    <span className="ml-auto text-zinc-500">{selectedRows.size}</span>
                  )}
                </button>
                <div className="h-px bg-app-border my-1" />
                <button
                  onClick={handleCopyAsInsert}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-app-hover hover:text-white flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                  Copiar como INSERT
                </button>
                <div className="h-px bg-app-border my-1" />
                <button
                  onClick={handleSelectAll}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-300 hover:bg-app-hover hover:text-white flex items-center gap-2"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Selecionar todas
                </button>
              </div>
            )}

            {/* Toast Notifications */}
            <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2">
              {toasts.map((toast) => (
                <div
                  key={toast.id}
                  className={`px-3 py-2 rounded-lg shadow-xl text-[11px] font-medium animate-fade-in ${
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
