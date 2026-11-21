import React, { useState } from 'react';
import { Download, ExternalLink, FileText, Paperclip, X } from 'lucide-react';
import { DOCUMENT_TYPES, documentStorageAvailable, readPolicyDocument, validateDocument } from '../services/insuranceDocumentService';
import { MAX_DOCUMENTS, type InsuranceDocument, type InsurancePolicy } from '../services/insuranceService';

const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please try again.';
const sizeText = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** Saved documents plus files picked in the form that upload when the policy is saved. */
export function DocumentsEditor({ saved, pending, onRemoveSaved, onAdd, onRemovePending, title = 'Policy documents', emptyText = 'No documents yet. Attach the policy wording or certificate so you can open it later.' }: {
  title?: string; emptyText?: string;
  saved: InsuranceDocument[]; pending: File[]; onRemoveSaved: (doc: InsuranceDocument) => void; onAdd: (file: File) => void; onRemovePending: (file: File) => void;
}) {
  const [error, setError] = useState('');
  const available = documentStorageAvailable();
  const full = saved.length + pending.length >= MAX_DOCUMENTS;
  const row = 'flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs';
  return <div className="sm:col-span-2">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-secondary">{title} <span className="font-normal">· PDF or image, up to 15 MB</span></p>
      {available && <label className={`flex cursor-pointer items-center gap-1 text-xs font-bold text-primary ${full ? 'pointer-events-none opacity-40' : ''}`}>
        <Paperclip size={13} />Attach file
        <input type="file" className="sr-only" disabled={full} accept={DOCUMENT_TYPES.join(',')} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''; setError('');
          if (!file) return;
          try { validateDocument(file); onAdd(file); } catch (err) { setError(errorText(err)); }
        }} />
      </label>}
    </div>
    {!available ? <p className="mt-2 rounded-lg bg-background p-3 text-xs text-secondary">Storing documents needs cloud sync. Sign in to keep PDFs with your records.</p>
      : !saved.length && !pending.length ? <p className="mt-2 rounded-lg bg-background p-3 text-xs text-secondary">{emptyText}</p>
      : <ul className="mt-2 space-y-2">
        {saved.map(doc => <li key={doc.path} className={row}><FileText size={14} className="shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate">{doc.name}</span><span className="text-secondary">{sizeText(doc.size)}</span><button type="button" aria-label={`Remove ${doc.name}`} onClick={() => onRemoveSaved(doc)} className="p-1 text-secondary"><X size={14} /></button></li>)}
        {pending.map((file, i) => <li key={`${file.name}-${i}`} className={row}><FileText size={14} className="shrink-0 text-secondary" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-secondary">{sizeText(file.size)} · uploads on save</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => onRemovePending(file)} className="p-1 text-secondary"><X size={14} /></button></li>)}
      </ul>}
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
  </div>;
}

/** A policy's stored documents on its register card, each with view and download. */
export function DocumentsList({ policy }: { policy: InsurancePolicy }) {
  return <StoredDocuments docs={policy.documents ?? []} read={doc => readPolicyDocument(doc)} />;
}

/** Stored documents with view and download; `read` fetches a file from storage. */
export function StoredDocuments({ docs, read }: { docs: InsuranceDocument[]; read: (doc: InsuranceDocument) => Promise<Blob> }) {
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  if (!docs.length) return null;
  const view = async (doc: InsuranceDocument) => {
    // Open the tab while the click still counts as a user gesture, then point it at the file.
    const tab = window.open('', '_blank');
    setBusy(doc.path); setError('');
    try {
      const url = URL.createObjectURL(await read(doc));
      if (tab) tab.location.href = url; else window.location.assign(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
    } catch (e) { tab?.close(); setError(errorText(e)); } finally { setBusy(''); }
  };
  const download = async (doc: InsuranceDocument) => {
    setBusy(doc.path); setError('');
    try {
      const url = URL.createObjectURL(await read(doc));
      const link = document.createElement('a'); link.href = url; link.download = doc.name; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  return <div className="mt-4 space-y-1.5 text-xs">
    {docs.map(doc => <div key={doc.path} className="flex items-center gap-2 rounded-lg bg-background px-3 py-2">
      <FileText size={14} className="shrink-0 text-primary" />
      <span className="min-w-0 flex-1 truncate" title={doc.name}>{doc.name}</span>
      <button type="button" disabled={!!busy} onClick={() => view(doc)} aria-label={`View ${doc.name}`} className="flex items-center gap-1 font-semibold text-primary disabled:opacity-50"><ExternalLink size={13} />{busy === doc.path ? 'Opening…' : 'View'}</button>
      <button type="button" disabled={!!busy} onClick={() => download(doc)} aria-label={`Download ${doc.name}`} className="flex items-center gap-1 font-semibold text-secondary disabled:opacity-50"><Download size={13} />Download</button>
    </div>)}
    {error && <p role="alert" className="text-red-400">{error}</p>}
  </div>;
}
