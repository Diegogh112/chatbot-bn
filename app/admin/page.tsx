'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';

interface Document {
  id: string;
  nombre: string;
  tipo: string;
  fecha_carga: string;
}

const ADMIN_SECRET = process.env.NEXT_PUBLIC_ADMIN_SECRET ?? '';

function typeBadge(tipo: string) {
  const t = tipo.toLowerCase();
  if (['pdf','docx','xlsx','xlsm','txt','nota'].includes(t)) return t;
  return 'txt';
}

function NoteViewerModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/documents/${doc.id}/chunks`, {
          headers: { 'x-admin-secret': ADMIN_SECRET },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setContent(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar contenido');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [doc.id]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <span className={`doc-type-badge doc-type-badge--${typeBadge(doc.tipo)}`}>{doc.tipo}</span>
            <span>{doc.nombre}</span>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="modal-body">
          {isLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className="spinner spinner--dark" />
            </div>
          )}
          {error && <div className="alert alert--error">⚠ {error}</div>}
          {content && (
            <pre className="note-content-pre">{content}</pre>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-primary" style={{ width: 'auto', margin: 0 }} onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Note state
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteMsg, setNoteMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Viewer state
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoadingDocs(true);
    setDocsError(null);
    try {
      const res = await fetch('/api/documents', {
        headers: { 'x-admin-secret': ADMIN_SECRET },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      setDocuments(await res.json());
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Error al cargar documentos');
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': ADMIN_SECRET },
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? `Error ${res.status}`);
      }
      setDocuments(prev => prev.filter(d => d.id !== id));
    } catch (err) {
      setDocsError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;
    setUploadMsg(null);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-admin-secret': ADMIN_SECRET },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setUploadMsg({ type: 'success', text: `"${data.nombre}" subido correctamente.` });
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchDocuments();
    } catch (err) {
      setUploadMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error al subir' });
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSaveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    setNoteMsg(null);
    setIsSavingNote(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ titulo: noteTitle.trim(), contenido: noteContent.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setNoteMsg({ type: 'success', text: `Nota "${data.nombre}" guardada correctamente.` });
      setNoteTitle('');
      setNoteContent('');
      fetchDocuments();
    } catch (err) {
      setNoteMsg({ type: 'error', text: err instanceof Error ? err.message : 'Error al guardar nota' });
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <div className="admin-layout">
      {viewingDoc && (
        <NoteViewerModal doc={viewingDoc} onClose={() => setViewingDoc(null)} />
      )}
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-bn.png"
            alt="Banco de la Nación"
            className="admin-header-bn-logo"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="admin-header-divider" />
          <div>
            <div className="admin-header-title">Panel de Administración</div>
            <div className="admin-header-subtitle">Banquito · Gestión de Conocimiento TI</div>
          </div>
        </div>
        <Link href="/" className="btn-back">
          ← Volver al chat
        </Link>
      </header>

      <div className="admin-content">

        {/* Upload Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-icon admin-card-icon--blue">📤</div>
            <div>
              <div className="admin-card-title">Subir documento</div>
              <div className="admin-card-desc">PDF, DOCX, XLSX, XLSM o TXT</div>
            </div>
          </div>
          <div className="admin-card-body">
            {uploadMsg && (
              <div className={`alert alert--${uploadMsg.type}`}>
                {uploadMsg.type === 'success' ? '✓' : '⚠'} {uploadMsg.text}
              </div>
            )}
            <form onSubmit={handleUpload}>
              <div className="upload-dropzone">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.xlsx,.xlsm,.txt"
                  disabled={isUploading}
                  onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
                  aria-label="Seleccionar archivo"
                />
                <div className="upload-icon">📁</div>
                <div className="upload-dropzone-text">
                  {selectedFile ? selectedFile.name : 'Haz clic o arrastra un archivo aquí'}
                </div>
                <div className="upload-dropzone-hint">
                  {selectedFile
                    ? `${(selectedFile.size / 1024).toFixed(1)} KB`
                    : 'PDF, DOCX, XLSX, TXT · máx. recomendado 10 MB'}
                </div>
              </div>
              <button
                type="submit"
                className="btn-primary"
                disabled={isUploading || !selectedFile}
              >
                {isUploading ? <><div className="spinner" /> Procesando...</> : '⬆ Subir documento'}
              </button>
            </form>
          </div>
        </div>

        {/* Note Card */}
        <div className="admin-card">
          <div className="admin-card-header">
            <div className="admin-card-icon admin-card-icon--green">📝</div>
            <div>
              <div className="admin-card-title">Agregar nota manual</div>
              <div className="admin-card-desc">El título se usará como fuente en las respuestas</div>
            </div>
          </div>
          <div className="admin-card-body">
            {noteMsg && (
              <div className={`alert alert--${noteMsg.type}`}>
                {noteMsg.type === 'success' ? '✓' : '⚠'} {noteMsg.text}
              </div>
            )}
            <form onSubmit={handleSaveNote}>
              <div className="form-group">
                <label className="form-label" htmlFor="note-title">Título (referencia)</label>
                <input
                  id="note-title"
                  className="form-input"
                  type="text"
                  placeholder="Ej: Requisitos Cuenta de Ahorros 2025"
                  value={noteTitle}
                  onChange={e => setNoteTitle(e.target.value)}
                  disabled={isSavingNote}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="note-content">Contenido</label>
                <textarea
                  id="note-content"
                  className="form-textarea"
                  placeholder="Escribe la información que deseas que Banquito conozca..."
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  disabled={isSavingNote}
                />
              </div>
              <button
                type="submit"
                className="btn-primary btn-success"
                disabled={isSavingNote || !noteTitle.trim() || !noteContent.trim()}
              >
                {isSavingNote ? <><div className="spinner" /> Guardando...</> : '💾 Guardar nota'}
              </button>
            </form>
          </div>
        </div>

        {/* Documents List */}
        <div className="admin-card admin-docs-section">
          <div className="admin-card-header">
            <div className="admin-card-icon admin-card-icon--blue">🗂</div>
            <div>
              <div className="admin-card-title">
                Base de conocimiento
                {documents.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '13px', marginLeft: '8px' }}>
                    {documents.length} {documents.length === 1 ? 'documento' : 'documentos'}
                  </span>
                )}
              </div>
              <div className="admin-card-desc">Todos los documentos y notas disponibles para Banquito</div>
            </div>
          </div>
          <div className="admin-card-body">
            {docsError && (
              <div className="alert alert--error">⚠ {docsError}</div>
            )}
            {isLoadingDocs ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
                <div className="spinner spinner--dark" />
              </div>
            ) : documents.length === 0 ? (
              <div className="docs-empty">
                <div className="docs-empty-icon">📭</div>
                <p>No hay documentos en la base de conocimiento.</p>
                <p style={{ fontSize: '12px', marginTop: '6px' }}>Sube un archivo o agrega una nota para empezar.</p>
              </div>
            ) : (
              <div className="docs-list">
                {documents.map(doc => (
                  <div key={doc.id} className="doc-item">
                    <span className={`doc-type-badge doc-type-badge--${typeBadge(doc.tipo)}`}>
                      {doc.tipo}
                    </span>
                    <div className="doc-info">
                      <div className="doc-name" title={doc.nombre}>{doc.nombre}</div>
                      <div className="doc-date">
                        {new Date(doc.fecha_carga).toLocaleDateString('es-PE', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="doc-item-actions">
                      <button
                        className="btn-view"
                        onClick={() => setViewingDoc(doc)}
                        aria-label={`Ver contenido de ${doc.nombre}`}
                      >
                        👁 Ver
                      </button>
                      <button
                        className="btn-delete"
                        onClick={() => handleDelete(doc.id, doc.nombre)}
                        aria-label={`Eliminar ${doc.nombre}`}
                      >
                        🗑 Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
