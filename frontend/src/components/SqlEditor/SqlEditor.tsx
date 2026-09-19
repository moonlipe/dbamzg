import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

export interface SqlEditorHandle {
  getSelectedOrCurrentStatement: () => string;
  getFullText: () => string;
  setFullText: (text: string) => void;
  focus: () => void;
}

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  onExecuteAll?: () => void;
  onSave?: () => void;
  language?: string;
}

const SqlEditor = forwardRef<SqlEditorHandle, SqlEditorProps>(function SqlEditor(
  { value, onChange, onExecute, onExecuteAll, onSave, language = 'sql' },
  ref
) {
  const editorRef = useRef<any>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;
  const onExecuteAllRef = useRef(onExecuteAll);
  onExecuteAllRef.current = onExecuteAll;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const getSelectedOrCurrentStatement = (): string => {
    const editor = editorRef.current;
    if (!editor) return valueRef.current;

    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!model) return valueRef.current;

    const selectedText = model.getValueInRange(selection).trim();
    if (selectedText) return selectedText;

    const cursorPos = editor.getPosition();
    const fullText = model.getValue();
    const lines = fullText.split('\n');

    const cursorLine = cursorPos.lineNumber - 1;

    let startLine = cursorLine;
    while (startLine > 0 && lines[startLine - 1].trim() !== '') {
      startLine--;
    }

    let endLine = cursorLine;
    while (endLine < lines.length - 1 && lines[endLine + 1].trim() !== '') {
      endLine++;
    }

    const stmt = lines.slice(startLine, endLine + 1).join('\n').trim();
    return stmt || fullText.trim();
  };

  useImperativeHandle(ref, () => ({
    getSelectedOrCurrentStatement,
    getFullText: () => editorRef.current?.getModel()?.getValue() || '',
    setFullText: (text: string) => editorRef.current?.setValue(text),
    focus: () => editorRef.current?.focus(),
  }));

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;

    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query (Ctrl+Enter)',
      keybindings: [
        2048 | 3,
      ],
      run: () => {
        onExecuteRef.current?.();
      },
    });

    editor.addAction({
      id: 'execute-all',
      label: 'Execute All (Shift+Ctrl+Enter)',
      keybindings: [
        2048 | 1024 | 3,
      ],
      run: () => {
        onExecuteAllRef.current?.();
      },
    });

    editor.addAction({
      id: 'save-query',
      label: 'Save Query (Ctrl+S)',
      keybindings: [
        2048 | 49,
      ],
      run: () => {
        onSaveRef.current?.();
      },
    });

    editor.focus();
  };

  const handleChange = (newValue: string | undefined) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (editor && editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={language}
        value={value}
        onChange={handleChange}
        onMount={handleMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          roundedSelection: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 12, bottom: 12 },
          lineHeight: 20,
          renderLineHighlight: 'line',
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          contextmenu: true,
        }}
      />
    </div>
  );
});

export default SqlEditor;
