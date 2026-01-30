import React, { useState } from 'react';

const ImportDialog = ({ isOpen, onClose, onImportSuccess }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [error, setError] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleSelectFile = async () => {
    try {
      setError(null);
      const result = await window.electron.openJsonFile();

      if (!result) {
        // User cancelled
        return;
      }

      setSelectedFile(result.filePath);
      setFileData(result.data);
    } catch (err) {
      setError(err.message || 'Failed to read file');
      setSelectedFile(null);
      setFileData(null);
    }
  };

  const handleImport = async () => {
    if (!fileData) return;

    try {
      setImporting(true);
      setError(null);

      await window.electron.importProjectFromJson(fileData);

      // Success - close dialog and notify parent
      if (onImportSuccess) {
        onImportSuccess();
      }
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to import project');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setFileData(null);
    setError(null);
    setImporting(false);
    onClose();
  };

  // Count cards in the project data
  const countCards = (data) => {
    if (!data?.phases) return 0;

    let count = 0;
    for (const phase of data.phases) {
      for (const subphase of phase.subphases || []) {
        count += (subphase.cards || []).length;
      }
    }
    return count;
  };

  // Count phases
  const countPhases = (data) => {
    return data?.phases?.length || 0;
  };

  // Count subphases
  const countSubphases = (data) => {
    if (!data?.phases) return 0;
    let count = 0;
    for (const phase of data.phases) {
      count += (phase.subphases || []).length;
    }
    return count;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div
          className="bg-dark-surface border border-dark-border rounded-lg shadow-xl w-full max-w-lg mx-4 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-dark-border">
            <h2 className="text-lg font-bold text-dark-text">Import Project</h2>
            <button
              onClick={handleClose}
              className="p-1 rounded hover:bg-dark-hover text-dark-text-secondary hover:text-dark-text transition-colors"
            >
              <span className="text-xl">x</span>
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* File Picker */}
            <div>
              <label className="block text-sm font-medium text-dark-text mb-2">
                Select Kanban JSON File
              </label>
              <button
                onClick={handleSelectFile}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg hover:border-blue-500 transition-colors text-left flex items-center gap-3"
              >
                <span className="text-2xl">📁</span>
                <div className="flex-1 min-w-0">
                  {selectedFile ? (
                    <span className="text-dark-text truncate block">
                      {selectedFile.split(/[/\\]/).pop()}
                    </span>
                  ) : (
                    <span className="text-dark-text-secondary">
                      Click to browse...
                    </span>
                  )}
                </div>
              </button>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Preview */}
            {fileData && (
              <div className="p-4 bg-dark-bg rounded-lg border border-dark-border">
                <h3 className="text-sm font-medium text-dark-text-secondary mb-3">
                  Preview
                </h3>

                {/* Project Name */}
                <div className="mb-4">
                  <p className="text-xl font-bold text-dark-text">
                    {fileData.name || 'Unnamed Project'}
                  </p>
                  {fileData.description && (
                    <p className="text-sm text-dark-text-secondary mt-1 line-clamp-2">
                      {fileData.description}
                    </p>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-2 bg-dark-surface rounded">
                    <p className="text-2xl font-bold text-blue-400">
                      {countPhases(fileData)}
                    </p>
                    <p className="text-xs text-dark-text-secondary">Phases</p>
                  </div>
                  <div className="text-center p-2 bg-dark-surface rounded">
                    <p className="text-2xl font-bold text-green-400">
                      {countSubphases(fileData)}
                    </p>
                    <p className="text-xs text-dark-text-secondary">Subphases</p>
                  </div>
                  <div className="text-center p-2 bg-dark-surface rounded">
                    <p className="text-2xl font-bold text-purple-400">
                      {countCards(fileData)}
                    </p>
                    <p className="text-xs text-dark-text-secondary">Cards</p>
                  </div>
                </div>

                {/* Slug */}
                {fileData.slug && (
                  <p className="text-xs text-dark-text-secondary mt-3">
                    Slug: <code className="bg-dark-surface px-1 rounded">{fileData.slug}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-dark-border">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg text-dark-text-secondary hover:text-dark-text hover:bg-dark-hover transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={!fileData || importing}
              className={`
                px-6 py-2 rounded-lg font-medium transition-colors
                ${fileData && !importing
                  ? 'bg-blue-600 hover:bg-blue-500 text-white'
                  : 'bg-dark-border text-dark-text-secondary cursor-not-allowed'
                }
              `}
            >
              {importing ? 'Importing...' : 'Import Project'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ImportDialog;
