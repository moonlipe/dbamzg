import { useState, useEffect } from 'react';

const COLORS = [
  '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316',
  '#eab308', '#06b6d4', '#8b5cf6', '#f43f5e', '#14b8a6',
];

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState(value);

  useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setHexInput(raw);
    if (/^#[0-9a-f]{6}$/i.test(raw)) {
      onChange(raw);
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value;
    setHexInput(color);
    onChange(color);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-zinc-400 mb-1.5">Cor de Identificação</label>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 items-center">
          {COLORS.map((color) => (
            <button
              key={color}
              onClick={() => { onChange(color); setHexInput(color); }}
              className={`w-7 h-7 rounded-full transition-all ${
                value === color
                  ? 'ring-2 ring-offset-2 ring-offset-app-surface'
                  : 'hover:scale-110'
              }`}
              style={{
                backgroundColor: color,
                boxShadow: value === color ? `0 0 0 2px #0f1117, 0 0 0 4px ${color}` : 'none',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={handleNativeChange}
            className="w-7 h-7 rounded cursor-pointer border border-app-border bg-transparent p-0"
          />
          <input
            type="text"
            value={hexInput}
            onChange={handleHexChange}
            className="w-24 h-7 px-2 bg-app-bg border border-app-border rounded text-xs font-mono text-zinc-300 focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
            placeholder="#000000"
            maxLength={7}
          />
        </div>
      </div>
    </div>
  );
}
