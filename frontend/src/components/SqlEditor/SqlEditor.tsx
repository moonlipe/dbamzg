import { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  language?: string;
}

export default function SqlEditor({ value, onChange, onExecute, language = 'sql' }: SqlEditorProps) {
  const editorRef = useRef<any>(null);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;

    // Register Ctrl+Enter / Cmd+Enter keybinding inside Monaco
    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [
        2048 | 3, // Ctrl+Enter (Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.Enter)
      ],
      run: () => {
        onExecute?.();
      },
    });

    editor.focus();
  };

  const handleChange = (newValue: string | undefined) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  };

  // Sync external value changes
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
          contextmenu: false,
        }}
      />
    </div>
  );
}
