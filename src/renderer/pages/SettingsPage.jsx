import React, { useState, useEffect } from 'react';
import { copyText } from '../utils/clipboard.js';

// A stored, editable path with a copy button - the app's own repo has no
// project row, so its directory_path lives in the settings table instead.
// Deliberately never falls back to the detected "Running from" path: that is
// where this process runs, not a path on the machine being typed at.
function StoredPathRow({ label, settingKey, placeholder, hint }) {
  const [value, setValue] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electron.getSetting(settingKey)
      .then(v => { if (!cancelled) { setValue(v); setLoaded(true); } })
      .catch(err => { if (!cancelled) { setError(err.message || 'Failed to load'); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [settingKey]);

  // Not set: the field is open and ready, rather than hidden behind an Edit
  const showInput = editing || (loaded && !value);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const stored = await window.electron.setSetting(settingKey, draft);
      setValue(stored);
      setEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="py-2 border-b border-dark-border">
      <div className="flex justify-between items-center gap-4">
        <span className="text-dark-text-secondary whitespace-nowrap">{label}</span>
        {!loaded ? (
          <span className="text-dark-text-secondary">...</span>
        ) : showInput ? (
          <div className="flex items-center gap-2 flex-1 justify-end min-w-0">
            {!value && !editing && (
              <span className="text-xs text-amber-400 whitespace-nowrap">Not set</span>
            )}
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape' && editing) { setEditing(false); setError(null); }
              }}
              placeholder={placeholder}
              className="flex-1 min-w-0 max-w-md px-2 py-1 bg-dark-bg border border-dark-border rounded text-sm text-dark-text font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSave}
              disabled={saving || (!draft.trim() && !value)}
              className="px-3 py-1 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            {editing && (
              <button
                onClick={() => { setEditing(false); setError(null); }}
                className="px-3 py-1 rounded text-xs font-medium bg-dark-bg border border-dark-border text-dark-text-secondary hover:text-dark-text"
              >
                Cancel
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-dark-text font-mono text-right break-all">{value}</span>
            <button
              onClick={async () => {
                try {
                  await copyText(value);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch (err) {
                  console.error('Failed to copy path:', err);
                }
              }}
              className={`flex-shrink-0 transition-colors ${copied ? 'text-green-400' : 'text-dark-text-secondary hover:text-dark-text'}`}
              title={copied ? 'Copied!' : 'Copy path to clipboard'}
            >
              {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => { setDraft(value); setEditing(true); setError(null); }}
              className="flex-shrink-0 text-dark-text-secondary hover:text-dark-text transition-colors"
              title={`Change ${label}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-400 text-right">{error}</p>}
      {hint && showInput && <p className="mt-1 text-xs text-dark-text-secondary text-right">{hint}</p>}
    </div>
  );
}

function SettingsPage({ onProjectsChange }) {
  // Default columns state
  const [defaultColumns, setDefaultColumns] = useState(['Not Started', 'In Progress', 'Done']);
  const [newColumn, setNewColumn] = useState('');

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [dataMessage, setDataMessage] = useState(null);

  // Delete project state
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // App info state
  const [appInfo, setAppInfo] = useState(null);

  // Load initial data
  useEffect(() => {
    loadAppInfo();
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectList = await window.electron.getAllProjects();
      setProjects(projectList || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const loadAppInfo = async () => {
    try {
      const info = await window.electron.getAppInfo();
      setAppInfo(info);
    } catch (error) {
      console.error('Failed to load app info:', error);
    }
  };

  const handleAddColumn = () => {
    if (newColumn.trim() && !defaultColumns.includes(newColumn.trim())) {
      setDefaultColumns([...defaultColumns, newColumn.trim()]);
      setNewColumn('');
    }
  };

  const handleRemoveColumn = (index) => {
    if (defaultColumns.length > 1) {
      setDefaultColumns(defaultColumns.filter((_, i) => i !== index));
    }
  };

  const handleMoveColumn = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < defaultColumns.length) {
      const newColumns = [...defaultColumns];
      [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
      setDefaultColumns(newColumns);
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    setDataMessage(null);

    try {
      const data = await window.electron.exportAllProjects();

      if (data.length === 0) {
        setDataMessage({ type: 'info', text: 'No projects to export' });
        return;
      }

      const filePath = await window.electron.saveJsonFile('kanban_export.json');

      if (filePath) {
        await window.electron.writeJsonFile(filePath, data);
        setDataMessage({ type: 'success', text: `Exported ${data.length} project(s) to ${filePath}` });
      }
    } catch (error) {
      setDataMessage({ type: 'error', text: error.message });
    } finally {
      setExporting(false);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    setDataMessage(null);

    try {
      const result = await window.electron.clearAllData();
      setDataMessage({ type: 'success', text: `Deleted ${result.deletedCount} project(s)` });
      setShowClearConfirm(false);
      await loadProjects(); // Refresh local project list
      if (onProjectsChange) onProjectsChange(); // Refresh App's project list (sidebar dropdown)
    } catch (error) {
      setDataMessage({ type: 'error', text: error.message });
    } finally {
      setClearing(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!selectedProjectId) return;

    setDeleting(true);
    setDataMessage(null);

    try {
      const project = projects.find(p => p.id === parseInt(selectedProjectId));
      await window.electron.deleteProject(parseInt(selectedProjectId));
      setDataMessage({ type: 'success', text: `Deleted project "${project?.name || 'Unknown'}"` });
      setShowDeleteConfirm(false);
      setSelectedProjectId('');
      await loadProjects(); // Refresh local project list
      if (onProjectsChange) onProjectsChange(); // Refresh App's project list (sidebar dropdown)
    } catch (error) {
      setDataMessage({ type: 'error', text: error.message });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="h-full overflow-auto scrollbar-dark">
      <div className="max-w-3xl mx-auto p-6 space-y-8">
        <h1 className="text-3xl font-bold text-dark-text">Settings</h1>

        {/* Default Columns Configuration */}
        <section className="bg-dark-surface rounded-lg border border-dark-border p-6">
          <h2 className="text-xl font-semibold mb-4 text-dark-text">Default Columns</h2>
          <p className="text-dark-text-secondary mb-4 text-sm">
            Configure the default columns for new projects.
          </p>

          <div className="space-y-2 mb-4">
            {defaultColumns.map((column, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-dark-bg rounded-lg border border-dark-border"
              >
                <span className="flex-1 text-dark-text">{column}</span>
                <button
                  onClick={() => handleMoveColumn(index, -1)}
                  disabled={index === 0}
                  className="p-1 text-dark-text-secondary hover:text-dark-text disabled:opacity-30"
                  title="Move up"
                >
                  ^
                </button>
                <button
                  onClick={() => handleMoveColumn(index, 1)}
                  disabled={index === defaultColumns.length - 1}
                  className="p-1 text-dark-text-secondary hover:text-dark-text disabled:opacity-30"
                  title="Move down"
                >
                  v
                </button>
                <button
                  onClick={() => handleRemoveColumn(index)}
                  disabled={defaultColumns.length <= 1}
                  className="p-1 text-red-400 hover:text-red-300 disabled:opacity-30"
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()}
              placeholder="Add new column..."
              className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddColumn}
              disabled={!newColumn.trim()}
              className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm hover:border-blue-500 transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </section>

        {/* Data Management Section */}
        <section className="bg-dark-surface rounded-lg border border-dark-border p-6">
          <h2 className="text-xl font-semibold mb-4 text-dark-text">Data Management</h2>

          {dataMessage && (
            <div className={`mb-4 p-3 rounded-lg border ${
              dataMessage.type === 'success' ? 'bg-green-900/30 border-green-700 text-green-300' :
              dataMessage.type === 'error' ? 'bg-red-900/30 border-red-700 text-red-300' :
              'bg-blue-900/30 border-blue-700 text-blue-300'
            }`}>
              {dataMessage.text}
            </div>
          )}

          {/* Delete Project */}
          <div className="mb-6 p-4 bg-dark-bg rounded-lg border border-dark-border">
            <h3 className="text-sm font-medium text-dark-text mb-3">Delete Project</h3>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  setSelectedProjectId(e.target.value);
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 min-w-48 px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a project...</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={!selectedProjectId}
                  className="px-4 py-2 bg-dark-surface border border-red-700 rounded-lg text-sm text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span>🗑️</span>
                  Delete Project
                </button>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-red-900/30 border border-red-700 rounded-lg">
                  <span className="text-sm text-red-300">Delete this project?</span>
                  <button
                    onClick={handleDeleteProject}
                    disabled={deleting}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium"
                  >
                    {deleting ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-sm hover:border-dark-hover"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {projects.length === 0 && (
              <p className="mt-2 text-xs text-dark-text-secondary">No projects available</p>
            )}
          </div>

          <div className="flex flex-wrap gap-4">
            {/* Export Button */}
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm hover:border-blue-500 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <span className="animate-spin">...</span>
                  Exporting...
                </>
              ) : (
                <>
                  <span>📤</span>
                  Export All Projects
                </>
              )}
            </button>

            {/* Clear Data Button */}
            {!showClearConfirm ? (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-4 py-2 bg-dark-bg border border-red-700 rounded-lg text-sm text-red-400 hover:bg-red-900/30 transition-colors flex items-center gap-2"
              >
                <span>🗑️</span>
                Clear All Data
              </button>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-red-900/30 border border-red-700 rounded-lg">
                <span className="text-sm text-red-300">Are you sure?</span>
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm font-medium"
                >
                  {clearing ? 'Deleting...' : 'Yes, Delete All'}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-1 bg-dark-bg border border-dark-border rounded text-sm hover:border-dark-hover"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </section>

        {/* About Section */}
        <section className="bg-dark-surface rounded-lg border border-dark-border p-6">
          <h2 className="text-xl font-semibold mb-4 text-dark-text">About</h2>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary">Application</span>
              <span className="text-dark-text font-medium">Kanban Manager</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary">Version</span>
              <span className="text-dark-text font-mono">{appInfo?.version || '1.0.0'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary">Electron</span>
              <span className="text-dark-text font-mono">{appInfo?.electron || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary">Node.js</span>
              <span className="text-dark-text font-mono">{appInfo?.node || '-'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary">Platform</span>
              <span className="text-dark-text font-mono">{appInfo?.platform || '-'} ({appInfo?.arch || '-'})</span>
            </div>
            <StoredPathRow
              label="Repo - laptop (dev)"
              settingKey="repo_path_laptop"
              placeholder="Path to the clone you author and push from"
              hint="Where the code is written and pushed from. Saved in the board's database; clear it and save to unset."
            />
            <StoredPathRow
              label="Repo - Pi (deploy)"
              settingKey="repo_path_pi"
              placeholder="Path on the Pi you pull and rebuild from, over SSH"
              hint="Where the code is pulled and rebuilt. Saved in the board's database; clear it and save to unset."
            />
            {/* Detected, not configured: which copy of the code THIS process is
                running. Informational only - not a path to copy. */}
            <div className="flex justify-between gap-4 py-2 border-b border-dark-border">
              <span className="text-dark-text-secondary whitespace-nowrap">Running from</span>
              <span className="text-dark-text-secondary font-mono text-right break-all">{appInfo?.directory || '-'}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-dark-text-secondary">GitHub</span>
              <span className="text-blue-400 font-mono">github.com/Kezman554/Kanban_App</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-dark-border">
            <p className="text-xs text-dark-text-secondary text-center">
              A desktop Kanban app for orchestrating Claude Code sessions.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default SettingsPage;
