import React, { useState, useEffect } from 'react';
import { testPromptGenerator } from '../services/promptGenerator.js';

function SettingsPage({ onProjectsChange }) {
  // API Key state
  const [maskedKey, setMaskedKey] = useState(null);
  const [newApiKey, setNewApiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [keyError, setKeyError] = useState(null);
  const [keySuccess, setKeySuccess] = useState(null);

  // API Test state
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState(null);

  // Prompt Generator Test state
  const [testStatus, setTestStatus] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

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
    loadMaskedKey();
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

  const loadMaskedKey = async () => {
    try {
      const masked = await window.electron.getMaskedApiKey();
      setMaskedKey(masked);
    } catch (error) {
      console.error('Failed to load API key:', error);
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

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) {
      setKeyError('Please enter an API key');
      return;
    }

    setSavingKey(true);
    setKeyError(null);
    setKeySuccess(null);

    try {
      await window.electron.saveApiKey(newApiKey.trim());
      setKeySuccess('API key saved successfully');
      setNewApiKey('');
      setShowKeyInput(false);
      await loadMaskedKey();
    } catch (error) {
      setKeyError(error.message);
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionResult(null);

    try {
      const result = await window.electron.testApiConnection();
      setConnectionResult(result);
    } catch (error) {
      setConnectionResult({ success: false, error: error.message });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleTestPromptGenerator = async () => {
    setIsLoading(true);
    setTestStatus('running');
    setTestResult(null);

    try {
      const result = await testPromptGenerator();
      setTestResult(result);
      setTestStatus(result.success ? 'success' : 'error');
    } catch (error) {
      setTestResult({ error: error.message });
      setTestStatus('error');
    } finally {
      setIsLoading(false);
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

        {/* API Configuration Section */}
        <section className="bg-dark-surface rounded-lg border border-dark-border p-6">
          <h2 className="text-xl font-semibold mb-4 text-dark-text">API Configuration</h2>

          {/* Current Key Display */}
          <div className="mb-4">
            <label className="block text-sm text-dark-text-secondary mb-2">
              Anthropic API Key
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1 px-4 py-2 bg-dark-bg border border-dark-border rounded-lg font-mono text-sm">
                {maskedKey ? (
                  <span className="text-dark-text">{maskedKey}</span>
                ) : (
                  <span className="text-dark-text-secondary italic">No API key configured</span>
                )}
              </div>
              <button
                onClick={() => setShowKeyInput(!showKeyInput)}
                className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm hover:border-blue-500 transition-colors"
              >
                {showKeyInput ? 'Cancel' : 'Change'}
              </button>
            </div>
          </div>

          {/* New Key Input */}
          {showKeyInput && (
            <div className="mb-4 p-4 bg-dark-bg rounded-lg border border-dark-border">
              <label className="block text-sm text-dark-text-secondary mb-2">
                Enter New API Key
              </label>
              <div className="flex gap-3">
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="flex-1 px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleSaveApiKey}
                  disabled={savingKey}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {savingKey ? 'Saving...' : 'Save'}
                </button>
              </div>
              {keyError && (
                <p className="mt-2 text-sm text-red-400">{keyError}</p>
              )}
              {keySuccess && (
                <p className="mt-2 text-sm text-green-400">{keySuccess}</p>
              )}
            </div>
          )}

          {/* Test Connection */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleTestConnection}
              disabled={testingConnection || !maskedKey}
              className="px-4 py-2 bg-dark-bg border border-dark-border rounded-lg text-sm hover:border-green-500 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {testingConnection ? (
                <>
                  <span className="animate-spin">...</span>
                  Testing...
                </>
              ) : (
                <>
                  <span>🔌</span>
                  Test Connection
                </>
              )}
            </button>

            {connectionResult && (
              <span className={`text-sm ${connectionResult.success ? 'text-green-400' : 'text-red-400'}`}>
                {connectionResult.success ? '✓ Connected' : `✗ ${connectionResult.error}`}
              </span>
            )}
          </div>
        </section>

        {/* Prompt Generator Test Section */}
        <section className="bg-dark-surface rounded-lg border border-dark-border p-6">
          <h2 className="text-xl font-semibold mb-4 text-dark-text">Prompt Generator Test</h2>
          <p className="text-dark-text-secondary mb-4 text-sm">
            Test the prompt generator service with sample card data.
          </p>

          <button
            onClick={handleTestPromptGenerator}
            disabled={isLoading}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              isLoading
                ? 'bg-dark-border text-dark-text-secondary cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isLoading ? 'Testing...' : 'Run Test'}
          </button>

          {testStatus && (
            <div className="mt-4">
              <div className={`flex items-center gap-2 mb-2 ${
                testStatus === 'success' ? 'text-green-400' :
                testStatus === 'error' ? 'text-red-400' :
                'text-yellow-400'
              }`}>
                <span className="text-lg">
                  {testStatus === 'success' ? '✓' :
                   testStatus === 'error' ? '✗' : '⏳'}
                </span>
                <span className="font-medium">
                  {testStatus === 'success' ? 'Test Passed' :
                   testStatus === 'error' ? 'Test Failed' : 'Running...'}
                </span>
              </div>

              {testResult && (
                <div className="bg-dark-bg rounded-lg p-3 max-h-64 overflow-auto text-sm">
                  {testResult.success ? (
                    <div className="space-y-2">
                      <p className="text-dark-text-secondary">
                        Prompt generated ({testResult.prompt?.length || 0} chars)
                      </p>
                      {testResult.usage && (
                        <p className="text-dark-text-secondary text-xs">
                          Tokens: {testResult.usage.input_tokens} in / {testResult.usage.output_tokens} out
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-red-400">{testResult.error}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

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
