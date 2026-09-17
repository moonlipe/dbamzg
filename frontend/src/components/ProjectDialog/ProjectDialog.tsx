import { useState, useEffect } from 'react';
import { SaveProject } from '../../../wailsjs/go/main/App';
import { types } from '../../../wailsjs/go/models';
import ColorPicker from '../ColorPicker/ColorPicker';

interface ProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  editProject?: types.Project;
}

export default function ProjectDialog({ isOpen, onClose, onSave, editProject }: ProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b82f6');

  useEffect(() => {
    if (editProject) {
      setName(editProject.Name);
      setDescription(editProject.Description);
      setColor(editProject.Color);
    } else {
      setName('');
      setDescription('');
      setColor('#3b82f6');
    }
  }, [editProject, isOpen]);

  const handleSave = async () => {
    try {
      const project: types.Project = {
        Name: name,
        Description: description,
        Color: color,
        Connections: editProject?.Connections || [],
        convertValues: function(a: any, classs: any, asMap?: boolean): any { return a; },
      };
      await SaveProject(project);
      onSave();
      onClose();
    } catch (err) {
      console.error('Erro ao salvar projeto:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-app-surface border border-app-border rounded-lg w-[400px] max-h-[85vh] overflow-hidden shadow-2xl animate-slide-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-app-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent-purple/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-purple">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold">
              {editProject ? 'Editar Projeto' : 'Novo Projeto'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded hover:bg-app-hover flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Nome do Projeto</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-9 px-3 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors"
              placeholder="Ex: Producao, Desenvolvimento..."
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Descricao</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-20 px-3 py-2 bg-app-bg border border-app-border rounded text-sm focus:border-accent-blue focus:ring-1 focus:ring-accent-blue/50 transition-colors resize-none"
              placeholder="Descricao opcional do projeto..."
            />
          </div>

          {/* Color */}
          <ColorPicker value={color} onChange={setColor} />
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-app-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="h-8 px-4 rounded text-xs font-medium text-zinc-400 hover:text-white hover:bg-app-hover transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!name}
            className="h-8 px-4 bg-accent-blue hover:bg-accent-blue/90 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed rounded text-xs font-medium text-white transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
