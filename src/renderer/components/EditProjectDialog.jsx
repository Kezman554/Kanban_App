import React, { useEffect, useRef, useState } from 'react';
import { X } from './icons';

const SHORT_NAME_HINT = 'Short label used in summary exports. Defaults to the first word of the project name if blank.';

const fieldsFrom = (project) => ({
  name: project?.name || '',
  short_name: project?.short_name || '',
  description: project?.description || '',
  directory_path: project?.directory_path || '',
});

/**
 * One form for the project header: name, short name, description and folder.
 * Save writes all four in a single updateProject call; Cancel (or Escape)
 * discards the draft. Stays open with the error shown if the save fails.
 */
const EditProjectDialog = ({ isOpen, project, onClose, onSaved }) => {
  const [fields, setFields] = useState(fieldsFrom(project));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const nameRef = useRef(null);

  // Fresh draft from the stored project every time the form opens (keyed on
  // isOpen alone, so a board refresh while it is open can't wipe the draft)
  useEffect(() => {
    if (isOpen) {
      setFields(fieldsFrom(project));
      setError(null);
      setTimeout(() => nameRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    if (isOpen) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, saving, onClose]);

  if (!isOpen || !project) return null;

  const set = (key) => (e) => setFields((prev) => ({ ...prev, [key]: e.target.value }));
  const canSave = !saving && fields.name.trim() !== '';

  const handleBrowse = async () => {
    const picked = await window.electron.selectDirectory();
    if (picked) setFields((prev) => ({ ...prev, directory_path: picked }));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await window.electron.updateProject(project.id, {
        name: fields.name.trim(),
        short_name: fields.short_name,
        description: fields.description.trim() || null,
        directory_path: fields.directory_path.trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      console.error('Failed to update project:', err);
      setError(err.message || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full px-3 py-2 bg-page border border-line rounded-lg text-ink focus:outline-none focus:border-active-ring';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-scrim z-40" />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-panel border-[1.5px] border-line rounded-[20px] shadow-card flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-divider">
            <h2 className="text-xl font-bold text-ink">Edit Project</h2>
            <button
              onClick={onClose}
              disabled={saving}
              className="w-9 h-9 rounded-full border-[1.5px] border-line flex items-center justify-center text-ink hover:bg-hover transition-colors"
            aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Name <span className="text-danger-text">*</span>
              </label>
              <input ref={nameRef} type="text" value={fields.name} onChange={set('name')} disabled={saving} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Short name</label>
              <input type="text" value={fields.short_name} onChange={set('short_name')} disabled={saving} placeholder="e.g. Vault" className={inputClass} />
              <p className="text-xs text-muted mt-1">{SHORT_NAME_HINT}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">Description</label>
              <input type="text" value={fields.description} onChange={set('description')} disabled={saving} className={inputClass} />
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1">File path</label>
              <div className="flex gap-2">
                <input type="text" value={fields.directory_path} onChange={set('directory_path')} disabled={saving} className={`${inputClass} text-sm`} />
                {/* The browser board has no native folder picker - type the path */}
                {!window.electron.isBrowserBoard && (
                  <button
                    type="button"
                    onClick={handleBrowse}
                    disabled={saving}
                    className="px-3 py-2 rounded-lg bg-page border border-line text-ink hover:bg-hover transition-colors text-sm flex-shrink-0"
                  >
                    Browse…
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="p-3 bg-panel border border-danger-text rounded-lg">
                <p className="text-sm text-danger-text">{error}</p>
              </div>
            )}

            {/* Lets Enter in any field submit the form */}
            <button type="submit" className="hidden" />
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-divider">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-page border border-line text-ink hover:bg-hover transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSave}
              className="px-4 py-2 rounded-lg bg-primary hover:brightness-110 border-[1.5px] border-card-line text-cream font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default EditProjectDialog;
