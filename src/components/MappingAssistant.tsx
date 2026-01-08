'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

interface UnmappedKey {
  api_key: string;
  usage_count: number;
  suggested_email: string | null;
}

interface MappingAssistantProps {
  unmappedKeys: UnmappedKey[];
  knownEmails: string[];
  onSaveMapping: (apiKey: string, email: string) => Promise<void>;
  onComplete?: () => void;
  compact?: boolean;
}

export function MappingAssistant({
  unmappedKeys,
  knownEmails,
  onSaveMapping,
  onComplete,
  compact = false
}: MappingAssistantProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredEmails, setFilteredEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [remaining, setRemaining] = useState(unmappedKeys);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRemaining(unmappedKeys);
  }, [unmappedKeys]);

  useEffect(() => {
    if (editEmail) {
      const filtered = knownEmails.filter(e =>
        e.toLowerCase().includes(editEmail.toLowerCase())
      );
      setFilteredEmails(filtered);
    } else {
      setFilteredEmails(knownEmails);
    }
  }, [editEmail, knownEmails]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async (apiKey: string, email: string) => {
    if (!email) return;
    setSaving(true);
    try {
      await onSaveMapping(apiKey, email);
      setRemaining(prev => prev.filter(k => k.api_key !== apiKey));
      setEditingKey(null);
      setEditEmail('');
      setShowDropdown(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptAll = async () => {
    setSaving(true);
    const withSuggestions = remaining.filter(k => k.suggested_email);
    for (const item of withSuggestions) {
      await onSaveMapping(item.api_key, item.suggested_email!);
    }
    setRemaining(prev => prev.filter(k => !k.suggested_email));
    setSaving(false);
  };

  if (remaining.length === 0) {
    if (onComplete) {
      return (
        <div className="text-center py-4">
          <div className="text-emerald-400 text-lg mb-2">✓</div>
          <p className="font-mono text-sm text-emerald-400">All keys mapped!</p>
          <button
            onClick={onComplete}
            className="mt-4 rounded-lg bg-emerald-500 px-4 py-2 font-mono text-xs text-black hover:bg-emerald-400 transition-colors"
          >
            Continue
          </button>
        </div>
      );
    }
    return null;
  }

  const withSuggestions = remaining.filter(k => k.suggested_email);
  const withoutSuggestions = remaining.filter(k => !k.suggested_email);

  return (
    <div className={`space-y-4 ${compact ? 'text-sm' : ''}`}>
      {/* Auto-detected */}
      {withSuggestions.length > 0 && (
        <div className={`rounded-lg border border-emerald-500/20 bg-emerald-500/5 ${compact ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="font-mono text-[11px] uppercase tracking-wider text-emerald-400">
                Auto-Detected ({withSuggestions.length})
              </h4>
            </div>
            <button
              onClick={handleAcceptAll}
              disabled={saving}
              className="rounded bg-emerald-500 px-3 py-1 font-mono text-xs text-black hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Accept All'}
            </button>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {withSuggestions.map(item => (
              <div
                key={item.api_key}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] p-2"
              >
                <div className="flex-1 min-w-0">
                  <code className="font-mono text-[10px] text-white/50 truncate block">
                    {item.api_key}
                  </code>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-emerald-400">{item.suggested_email}</span>
                    <span className="font-mono text-[10px] text-faint">({item.usage_count} records)</span>
                  </div>
                </div>
                <button
                  onClick={() => handleSave(item.api_key, item.suggested_email!)}
                  disabled={saving}
                  className="ml-2 rounded bg-emerald-500/20 px-2 py-1 font-mono text-[10px] text-emerald-400 hover:bg-emerald-500/30"
                >
                  Accept
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual mapping needed */}
      {withoutSuggestions.length > 0 && (
        <div className={`rounded-lg border border-amber-500/20 bg-amber-500/5 ${compact ? 'p-4' : 'p-6'}`}>
          <h4 className="font-mono text-[11px] uppercase tracking-wider text-amber-400 mb-3">
            Manual Mapping ({withoutSuggestions.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {withoutSuggestions.map(item => (
              <div
                key={item.api_key}
                className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] p-2"
              >
                <div className="flex-1 min-w-0">
                  <code className="font-mono text-[10px] text-white/50 truncate block">
                    {item.api_key}
                  </code>
                  <span className="font-mono text-[10px] text-faint">{item.usage_count} records</span>
                </div>
                {editingKey === item.api_key ? (
                  <div className="flex items-center gap-2 ml-2" ref={dropdownRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={editEmail}
                        onChange={(e) => {
                          setEditEmail(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => setShowDropdown(true)}
                        placeholder="Select or type..."
                        className="w-40 rounded border border-white/10 bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-white placeholder-white/30 outline-none focus:border-amber-500/50"
                        autoFocus
                      />
                      {showDropdown && filteredEmails.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 max-h-32 overflow-y-auto rounded border border-white/10 bg-[#050507] z-50">
                          {filteredEmails.slice(0, 8).map(email => (
                            <button
                              key={email}
                              onClick={() => {
                                setEditEmail(email);
                                setShowDropdown(false);
                              }}
                              className="w-full px-2 py-1 text-left font-mono text-[10px] text-white/70 hover:bg-white/5"
                            >
                              {email}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleSave(item.api_key, editEmail)}
                      disabled={!editEmail || saving}
                      className="rounded bg-amber-500 px-2 py-1 font-mono text-[10px] text-black hover:bg-amber-400 disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingKey(null);
                        setEditEmail('');
                      }}
                      className="rounded border border-white/10 px-2 py-1 font-mono text-[10px] text-white/40 hover:bg-white/5"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingKey(item.api_key)}
                    className="ml-2 rounded border border-amber-500/30 px-2 py-1 font-mono text-[10px] text-amber-400 hover:bg-amber-500/10"
                  >
                    Assign
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
