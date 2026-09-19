import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, ChevronDown, Database, Table, Columns, Key, Eye, Play, Zap, AlertTriangle } from 'lucide-react';
import { GetDatabases, GetSchemas, GetTables, GetColumns, GetViews, GetProcedures, GetFunctions, GetTriggers } from '../../../wailsjs/go/main/App';
import ContextMenu, { ContextMenuItem } from '../ContextMenu/ContextMenu';

interface TreeNode {
  id: string;
  name: string;
  type: 'database' | 'schema' | 'tables' | 'table' | 'column' | 'views' | 'view' | 'procedures' | 'procedure' | 'functions' | 'function' | 'triggers' | 'trigger';
  children?: TreeNode[];
  data?: any;
  loaded?: boolean;
}

interface SchemaTreeProps {
  connectionName: string;
  onTableSelect: (tableName: string) => void;
  onOpenQuery?: (query: string) => void;
  onShowDefinition?: (name: string, type: string) => void;
}

export default function SchemaTree({ connectionName, onTableSelect, onOpenQuery, onShowDefinition }: SchemaTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [tree, setTree] = useState<TreeNode[]>([]);
  const loadingRef = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);

  useEffect(() => {
    setTree([]);
    setExpanded(new Set());
    setLoading(new Set());
    loadingRef.current = new Set();

    // Load databases directly — no connection root node (it's already in the sidebar)
    const loadDatabases = async () => {
      try {
        const databases = await GetDatabases(connectionName);
        setTree((databases || []).map((dbName) => ({
          id: `${connectionName}/${dbName}`,
          name: dbName,
          type: 'database' as const,
          loaded: false,
        })));
      } catch (err) {
        console.error('Erro ao carregar databases:', err);
      }
    };
    loadDatabases();
  }, [connectionName]);

  const updateNodeChildren = useCallback(
    (nodes: TreeNode[], targetId: string, children: TreeNode[], loaded: boolean): TreeNode[] => {
      return nodes.map((node) => {
        if (node.id === targetId) {
          return { ...node, children, loaded };
        }
        if (node.children) {
          return { ...node, children: updateNodeChildren(node.children, targetId, children, loaded) };
        }
        return node;
      });
    },
    []
  );

  const loadChildren = useCallback(async (node: TreeNode) => {
    if (loadingRef.current.has(node.id)) return;
    loadingRef.current.add(node.id);
    setLoading((prev) => new Set(prev).add(node.id));

    try {
      let children: TreeNode[] = [];

      if (node.type === 'database') {
        const dbName = node.name;
        const schemas = await GetSchemas(connectionName, dbName);
        children = (schemas || []).map((schemaName) => ({
          id: `${connectionName}/${dbName}/${schemaName}`,
          name: schemaName,
          type: 'schema' as const,
          loaded: false,
        }));
      } else if (node.type === 'schema') {
        const parts = node.id.split('/');
        const schemaName = parts[parts.length - 1];

        const [tables, views, procedures, functions, triggers] = await Promise.all([
          GetTables(connectionName, schemaName).catch(() => []),
          GetViews(connectionName, schemaName).catch(() => []),
          GetProcedures(connectionName, schemaName).catch(() => []),
          GetFunctions(connectionName, schemaName).catch(() => []),
          GetTriggers(connectionName, schemaName).catch(() => []),
        ]);

        children = [
          {
            id: `${node.id}/tables`,
            name: 'Tables',
            type: 'tables' as const,
            loaded: true,
            children: (tables || []).map((table) => ({
              id: `${node.id}/tables/${table.Name}`,
              name: table.Name,
              type: 'table' as const,
              loaded: false,
              data: table,
            })),
          },
          {
            id: `${node.id}/views`,
            name: 'Views',
            type: 'views' as const,
            loaded: true,
            children: (views || []).map((view) => ({
              id: `${node.id}/views/${view.Name}`,
              name: view.Name,
              type: 'view' as const,
              loaded: true,
              data: view,
            })),
          },
          {
            id: `${node.id}/procedures`,
            name: 'Procedures',
            type: 'procedures' as const,
            loaded: true,
            children: (procedures || []).map((proc) => ({
              id: `${node.id}/procedures/${proc.Name}`,
              name: proc.Name,
              type: 'procedure' as const,
              loaded: true,
              data: proc,
            })),
          },
          {
            id: `${node.id}/functions`,
            name: 'Functions',
            type: 'functions' as const,
            loaded: true,
            children: (functions || []).map((func) => ({
              id: `${node.id}/functions/${func.Name}`,
              name: func.Name,
              type: 'function' as const,
              loaded: true,
              data: func,
            })),
          },
          {
            id: `${node.id}/triggers`,
            name: 'Triggers',
            type: 'triggers' as const,
            loaded: true,
            children: (triggers || []).map((trigger) => ({
              id: `${node.id}/triggers/${trigger.Name}`,
              name: trigger.Name,
              type: 'trigger' as const,
              loaded: true,
              data: trigger,
            })),
          },
        ];
      } else if (node.type === 'table') {
        const tableName = node.name;
        const columns = await GetColumns(connectionName, tableName);
        children = (columns || []).map((col) => ({
          id: `${node.id}/${col.Name}`,
          name: col.Name,
          type: 'column' as const,
          loaded: true,
          data: col,
        }));
      }

      setTree((prev) => updateNodeChildren(prev, node.id, children, true));
    } catch (err) {
      console.error('Erro ao carregar filhos:', err);
    } finally {
      loadingRef.current.delete(node.id);
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
    }
  }, [connectionName, updateNodeChildren]);

  const toggleExpand = useCallback(async (node: TreeNode) => {
    const isExpanded = expanded.has(node.id);

    if (isExpanded) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      return;
    }

    setExpanded((prev) => new Set(prev).add(node.id));

    if (!node.loaded && node.type !== 'column') {
      await loadChildren(node);
    }
  }, [expanded, loadChildren]);

  const getIcon = (type: string) => {
    const size = 14;
    switch (type) {
      case 'database':
        return <Database size={size} className="text-accent-blue shrink-0" />;
      case 'schema':
        return (
          <div className="w-3.5 h-3.5 rounded border border-zinc-600 flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 rounded-sm bg-zinc-500" />
          </div>
        );
      case 'tables':
      case 'table':
        return <Table size={size} className="text-accent-purple shrink-0" />;
      case 'column':
        return <Columns size={size} className="text-zinc-500 shrink-0" />;
      case 'views':
      case 'view':
        return <Eye size={size} className="text-accent-green shrink-0" />;
      case 'procedures':
      case 'procedure':
        return <Play size={size} className="text-accent-yellow shrink-0" />;
      case 'functions':
      case 'function':
        return <Zap size={size} className="text-accent-orange shrink-0" />;
      case 'triggers':
      case 'trigger':
        return <AlertTriangle size={size} className="text-red-400 shrink-0" />;
      default:
        return null;
    }
  };

  const getContextMenuItems = (node: TreeNode): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const copyItem: ContextMenuItem = {
      label: 'Copiar nome',
      onClick: () => navigator.clipboard.writeText(node.name),
    };

    if (node.type === 'table') {
      items.push(
        { label: 'SELECT * FROM ' + node.name, onClick: () => onOpenQuery?.(`SELECT * FROM ${node.name}`) },
        { label: 'INSERT INTO ' + node.name, onClick: () => onOpenQuery?.(`INSERT INTO ${node.name} () VALUES ()`) },
        { label: 'ALTER TABLE ' + node.name, onClick: () => onOpenQuery?.(`ALTER TABLE ${node.name}`) },
        { label: 'DROP TABLE ' + node.name, onClick: () => onOpenQuery?.(`DROP TABLE ${node.name}`) },
        { separator: true },
        copyItem,
        { label: 'Ver DDL', onClick: () => onShowDefinition?.(node.name, 'table') },
      );
    } else if (node.type === 'view') {
      items.push(
        { label: 'SELECT * FROM ' + node.name, onClick: () => onOpenQuery?.(`SELECT * FROM ${node.name}`) },
        { separator: true },
        copyItem,
        { label: 'Ver Definition', onClick: () => onShowDefinition?.(node.name, 'view') },
      );
    } else if (node.type === 'procedure' || node.type === 'function' || node.type === 'trigger') {
      items.push(
        copyItem,
        { label: 'Ver Definition', onClick: () => onShowDefinition?.(node.name, node.type) },
      );
    } else if (node.type === 'column') {
      items.push(copyItem);
    } else if (node.type === 'database' || node.type === 'schema') {
      items.push(copyItem);
    }

    return items;
  };

  const renderNode = (node: TreeNode, level: number = 0) => {
    const isExpanded = expanded.has(node.id);
    const hasChildren = node.type !== 'column';
    const isTable = node.type === 'table';
    const isLoadingNode = loading.has(node.id);

    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-colors ${
            isTable
              ? 'hover:bg-accent-purple/10 hover:text-white text-zinc-300'
              : 'hover:bg-app-hover text-zinc-400 hover:text-zinc-200'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => {
            if (hasChildren) {
              toggleExpand(node);
            }
            if (isTable) {
              onTableSelect(node.name);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, node });
          }}
        >
          {hasChildren ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {isLoadingNode ? (
                <div className="w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
              ) : isExpanded ? (
                <ChevronDown size={12} className="text-zinc-500" />
              ) : (
                <ChevronRight size={12} className="text-zinc-500" />
              )}
            </span>
          ) : (
            <span className="w-4" />
          )}

          {getIcon(node.type)}

          <span className={`text-xs truncate ${isTable ? 'font-medium' : ''}`}>
            {node.name}
          </span>

          {node.type === 'column' && node.data && (
            <div className="ml-auto flex items-center gap-1">
              {node.data.IsPrimaryKey && (
                <Key size={10} className="text-accent-yellow" />
              )}
              <span className="text-2xs text-zinc-600 font-mono">
                {node.data.DataType}
              </span>
            </div>
          )}
        </div>

        {isExpanded && node.children && (
          <div className="animate-fade-in">
            {node.children.map((child) => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="text-xs py-1">
      {tree.map((node) => renderNode(node))}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.node)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
