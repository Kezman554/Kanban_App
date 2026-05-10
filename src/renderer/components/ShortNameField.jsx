import React, { useEffect, useRef, useState } from 'react';

const HINT = 'Short label used in summary exports. Defaults to the first word of the project name if blank.';

const ShortNameField = ({ value, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    const current = (value || '').trim();
    if (next === current) {
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      await onSave(next);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-dark-text-secondary">Short name:</span>
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            disabled={saving}
            placeholder="e.g. Vault"
            className="px-2 py-1 text-xs bg-dark-bg border border-dark-border rounded text-dark-text focus:outline-none focus:border-blue-500 w-32"
          />
        </div>
        <p className="text-[10px] text-dark-text-secondary leading-tight max-w-xs">{HINT}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      title={HINT}
      className="flex items-center gap-1.5 px-2 py-0.5 text-xs rounded border border-dark-border bg-dark-surface text-dark-text-secondary hover:text-dark-text hover:border-blue-500 transition-colors"
    >
      <span className="font-medium">Short:</span>
      <span className={value ? 'text-dark-text' : 'italic'}>
        {value || 'not set'}
      </span>
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
};

export default ShortNameField;
