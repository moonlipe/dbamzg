import { useState, useEffect } from 'react';
import { X, Copy, Check } from 'lucide-react';
import Editor from '@monaco-editor/react';

interface EntityDetailProps {
  entity: {
    type: string;
    name: string;
    data: any;
  };
  onClose: () => void;
  onExecuteDDL: (ddl: string) => void;
}

export default function EntityDetail({ entity, onClose, onExecuteDDL }: EntityDetailProps) {
  const [ddl, setDdl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (entity.data) {
      // DDL para tabelas, Definition para views/procedures/functions/triggers
      const content = entity.type === 'table' ? entity.data.DDL : entity.data.Definition;
      setDdl(content || '');
    }
  }, [entity.data]);

  const handleCopy = () => {
    navigator.clipboard.writeText(ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExecute = () => {
    onExecuteDDL(ddl);
  };

  return (
    <div className="flex flex-col h-full bg-app-bg border-l border-app-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-app-border bg-app-header">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">{entity.name}</span>
          <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
            {entity.type}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* DDL Editor */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full">
          <Editor
            height="100%"
            language="sql"
            value={ddl}
            onChange={(value) => setDdl(value || '')}
            theme="vs-dark"
            options={{
              readOnly: false,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-app-border bg-app-header">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copiado!' : 'Copiar DDL'}
        </button>
        <button
          onClick={handleExecute}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-accent-purple hover:bg-accent-purple/80 rounded transition-colors"
        >
          Executar DDL
        </button>
      </div>
    </div>
  );
}
