'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useTimeRange } from '@/contexts/TimeRangeContext';

interface ExportButtonProps {
  type: 'team' | 'usage' | 'commits';
  search?: string;
  view?: 'models' | 'tools';
  className?: string;
}

export function ExportButton({ type, search, view, className = '' }: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { getDateParams } = useTimeRange();

  const handleExport = async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getDateParams();
      const params = new URLSearchParams({ startDate, endDate });
      if (search) params.set('search', search);
      if (view) params.set('view', view);

      const response = await fetch(`/api/export/${type}?${params}`);

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Extract filename from Content-Disposition header
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || `${type}_export.csv`;

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isLoading}
      className={`px-3 py-1.5 rounded font-mono text-xs transition-all duration-200 bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60 flex items-center gap-1.5 ${
        isLoading ? 'cursor-wait opacity-70' : 'cursor-pointer'
      } ${className}`}
    >
      <Download className="w-3.5 h-3.5" />
      <span>{isLoading ? 'Exporting...' : 'Export'}</span>
    </button>
  );
}
