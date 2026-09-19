import React, { useRef, useState } from 'react';
import { FileText, GitCompare, Loader2, Trash2, Upload } from 'lucide-react';
import { AccountStatement, AccountStatementKind } from '../types';

interface StatementsListProps {
  statements: AccountStatement[];
  accountKind: AccountStatementKind;
  accountId: string;
  enabled: boolean;
  onUpload: (file: File, params: { accountKind: AccountStatementKind; cashAccountId?: string; cardId?: string }) => void | Promise<void>;
  onDownload: (statement: AccountStatement) => void | Promise<void>;
  onDelete: (statement: AccountStatement) => void | Promise<void>;
  onReconcile?: (statement: AccountStatement) => void;
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatUploadDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

const StatementsList: React.FC<StatementsListProps> = ({ statements, accountKind, accountId, enabled, onUpload, onDownload, onDelete, onReconcile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploading(true);
    try {
      await onUpload(file, {
        accountKind,
        cashAccountId: accountKind === 'Cash' ? accountId : undefined,
        cardId: accountKind === 'Card' ? accountId : undefined,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (statement: AccountStatement) => {
    setDownloadingId(statement.id);
    try {
      await onDownload(statement);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-secondary">Statements</p>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!enabled || isUploading}
          className="flex items-center gap-1 text-[10px] font-bold text-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {isUploading ? 'Uploading...' : 'Upload PDF'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {!enabled && (
        <p className="text-[10px] text-secondary italic">Sign in with a synced account to upload statements.</p>
      )}

      {statements.length === 0 ? (
        <p className="text-[10px] text-secondary text-center py-3">No statements uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {statements.map(statement => (
            <div
              key={statement.id}
              className="flex items-center justify-between gap-2 bg-surface border border-border rounded-lg px-2.5 py-2"
            >
              <button
                type="button"
                onClick={() => handleDownload(statement)}
                disabled={downloadingId === statement.id}
                className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:opacity-50"
              >
                {downloadingId === statement.id ? (
                  <Loader2 size={14} className="shrink-0 text-primary animate-spin" />
                ) : (
                  <FileText size={14} className="shrink-0 text-primary" />
                )}
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-textMain truncate">{statement.fileName}</span>
                  <span className="block text-[10px] text-secondary">
                    {formatUploadDate(statement.uploadedAt)}{statement.fileSize ? ` · ${formatFileSize(statement.fileSize)}` : ''}
                  </span>
                </span>
              </button>
              {onReconcile && (
                <button
                  type="button"
                  onClick={() => onReconcile(statement)}
                  className="text-secondary hover:text-primary shrink-0"
                  aria-label={`Reconcile ${statement.fileName}`}
                  title="Compare against recorded transactions"
                >
                  <GitCompare size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Remove ${statement.fileName}?`)) onDelete(statement);
                }}
                className="text-secondary hover:text-red-500 shrink-0"
                aria-label={`Delete ${statement.fileName}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StatementsList;
