'use client';

import { useState, useRef } from 'react';

interface FileUploadProps {
  adminSecret: string;
  onUploadSuccess: () => void;
}

export default function FileUpload({ adminSecret, onUploadSuccess }: FileUploadProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError('Por favor selecciona un archivo');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setIsLoading(true);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-admin-secret': adminSecret },
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? `Error ${response.status}`);
      }

      if (fileInputRef.current) fileInputRef.current.value = '';
      onUploadSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el archivo');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.txt"
        disabled={isLoading}
        aria-label="Seleccionar archivo"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Subiendo...' : 'Subir documento'}
      </button>
      {isLoading && <span role="status" aria-live="polite">Cargando...</span>}
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
    </form>
  );
}
