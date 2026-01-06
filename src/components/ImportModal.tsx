'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MappingAssistant } from './MappingAssistant';

interface UnmappedKey {
  api_key: string;
  usage_count: number;
  suggested_email: string | null;
}

interface ImportResult {
  type: string;
  result: {
    success: boolean;
    recordsImported: number;
    recordsSkipped: number;
    unmappedKeys?: string[];
    errors: string[];
  };
}

interface MappingsData {
  unmapped: UnmappedKey[];
  knownEmails: string[];
}

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export function ImportModal({ isOpen, onClose, onImportComplete }: ImportModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'mapping' | 'done'>('upload');
  const [mappingsData, setMappingsData] = useState<MappingsData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      setResult(data);

      if (data.result?.success) {
        onImportComplete();
        // Fetch mapping data to see if there are unmapped keys
        const mappingsRes = await fetch('/api/mappings');
        const mappings = await mappingsRes.json();
        setMappingsData(mappings);

        if (mappings.unmapped && mappings.unmapped.length > 0) {
          setStep('mapping');
        } else {
          setStep('done');
        }
      }
    } catch (error) {
      setResult({
        type: 'unknown',
        result: {
          success: false,
          recordsImported: 0,
          recordsSkipped: 0,
          errors: [error instanceof Error ? error.message : 'Upload failed'],
        },
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveMapping = async (apiKey: string, email: string) => {
    await fetch('/api/mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, email }),
    });
    onImportComplete();
    // Refresh mappings data
    const mappingsRes = await fetch('/api/mappings');
    const mappings = await mappingsRes.json();
    setMappingsData(mappings);
  };

  const handleClose = () => {
    setResult(null);
    setStep('upload');
    setMappingsData(null);
    onClose();
  };

  const handleSkipMapping = () => {
    setStep('done');
  };

  const handleMappingComplete = () => {
    setStep('done');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/70"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-[#0a0a0f] p-6 max-h-[80vh] overflow-y-auto"
          >
            <button
              onClick={handleClose}
              className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {step === 'upload' && (
              <>
                <h2 className="font-display text-xl text-white mb-1">Import Usage Data</h2>
                <p className="font-mono text-xs text-white/40 mb-6">
                  Upload a CSV export from Claude Code or Cursor
                </p>

                {!result ? (
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`
                      cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors
                      ${isDragging ? 'border-amber-500 bg-amber-500/10' : 'border-white/10 hover:border-white/20'}
                      ${isUploading ? 'pointer-events-none opacity-50' : ''}
                    `}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />

                    {isUploading ? (
                      <div className="font-mono text-sm text-white/60">Uploading...</div>
                    ) : (
                      <>
                        <div className="mb-2 text-3xl">📄</div>
                        <div className="font-mono text-sm text-white/60">
                          Drop CSV file here or click to browse
                        </div>
                        <div className="mt-2 font-mono text-[10px] text-white/30">
                          Supports Claude Code and Cursor exports
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={`rounded-lg p-4 ${result.result.success ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-lg ${result.result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                          {result.result.success ? '✓' : '✗'}
                        </span>
                        <span className={`font-mono text-sm ${result.result.success ? 'text-emerald-400' : 'text-red-400'}`}>
                          {result.result.success ? 'Import Successful' : 'Import Failed'}
                        </span>
                      </div>

                      <div className="font-mono text-xs text-white/60 space-y-1">
                        <div>Type: {result.type === 'claude_code' ? 'Claude Code' : result.type === 'cursor' ? 'Cursor' : 'Unknown'}</div>
                        <div>Records imported: {result.result.recordsImported.toLocaleString()}</div>
                        <div>Records skipped: {result.result.recordsSkipped.toLocaleString()}</div>
                      </div>
                    </div>

                    {result.result.errors.length > 0 && (
                      <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
                        <div className="font-mono text-xs text-red-400 mb-2">Errors:</div>
                        {result.result.errors.map((err, i) => (
                          <div key={i} className="font-mono text-[10px] text-white/60">{err}</div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => setResult(null)}
                      className="w-full rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 transition-colors"
                    >
                      Import Another File
                    </button>
                  </div>
                )}
              </>
            )}

            {step === 'mapping' && mappingsData && (
              <>
                <h2 className="font-display text-xl text-white mb-1">Map API Keys to Users</h2>
                <p className="font-mono text-xs text-white/40 mb-4">
                  {mappingsData.unmapped.length} API keys need to be mapped to user emails
                </p>

                <MappingAssistant
                  unmappedKeys={mappingsData.unmapped}
                  knownEmails={mappingsData.knownEmails}
                  onSaveMapping={handleSaveMapping}
                  onComplete={handleMappingComplete}
                  compact
                />

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleSkipMapping}
                    className="flex-1 rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 transition-colors"
                  >
                    Skip for Now
                  </button>
                </div>
              </>
            )}

            {step === 'done' && (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">✓</div>
                <h2 className="font-display text-xl text-white mb-2">Import Complete</h2>
                <p className="font-mono text-xs text-white/40 mb-6">
                  Your usage data is ready to view
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={() => {
                      setStep('upload');
                      setResult(null);
                    }}
                    className="rounded-lg border border-white/10 px-4 py-2 font-mono text-xs text-white/60 hover:bg-white/5 transition-colors"
                  >
                    Import More
                  </button>
                  <button
                    onClick={handleClose}
                    className="rounded-lg bg-amber-500 px-4 py-2 font-mono text-xs text-black hover:bg-amber-400 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
