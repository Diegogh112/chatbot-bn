'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BanquitoAvatar from './BanquitoAvatar';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  sources?: string[];
  id: number;
}

const SUGGESTIONS = [
  '¿Cuál es el estado del proyecto actual?',
  '¿Cuáles son los requerimientos pendientes de TI?',
  '¿Qué demandas de TI están en curso?',
  '¿Cuáles son los entregables del próximo sprint?',
];

let msgIdCounter = 0;

export default function Chat() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep messagesRef in sync with messages state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (editingId !== null) {
      textareaRef.current?.focus();
    }
  }, [editingId]);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function cancelRequest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
    // Elimina el mensaje del usuario que quedó sin respuesta
    setMessages(prev => {
      const last = prev[prev.length - 1];
      return last?.role === 'user' ? prev.slice(0, -1) : prev;
    });
  }

  async function sendMessage(text: string, replaceFromId?: number) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setError(null);
    setInput('');
    setEditingId(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Si se edita un mensaje existente, elimina ese mensaje y todos los posteriores
    if (replaceFromId !== undefined) {
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === replaceFromId);
        return idx >= 0 ? prev.slice(0, idx) : prev;
      });
    }

    const newUserMsg: ChatMessage = { role: 'user', text: trimmed, id: ++msgIdCounter };

    // Capture current messages BEFORE adding new one — this is the history
    setMessages(prev => {
      const historyForApi = prev.map(m => ({
        role: m.role === 'user' ? 'USER' as const : 'CHATBOT' as const,
        message: m.text,
      }));
      // Store for use in fetch below
      (sendMessage as unknown as { _history: typeof historyForApi })._history = historyForApi;
      return [...prev, newUserMsg];
    });

    setIsLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Get current messages for history (before state update propagates)
    const currentMessages = messagesRef.current;
    const historyForApi = currentMessages.map(m => ({
      role: m.role === 'user' ? 'USER' as const : 'CHATBOT' as const,
      message: m.text,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history: historyForApi }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      const botMsg: ChatMessage = {
        role: 'bot',
        text: data.answer,
        sources: data.sources,
        id: ++msgIdCounter,
      };
      setMessages(prev => [...prev, botMsg]);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return; // cancelado por el usuario
      setError(err instanceof Error ? err.message : 'Error al procesar la consulta');
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId !== null) {
      sendMessage(input, editingId);
    } else {
      sendMessage(input);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingId !== null) {
        sendMessage(input, editingId);
      } else {
        sendMessage(input);
      }
    }
    if (e.key === 'Escape' && editingId !== null) {
      setEditingId(null);
      setInput('');
    }
  }

  function startEdit(msg: ChatMessage) {
    setEditingId(msg.id);
    setInput(msg.text);
    setTimeout(autoResize, 10);
  }

  function cancelEdit() {
    setEditingId(null);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  return (
    <div className="chat-layout">

      {/* ── Header ── */}
      <header className="chat-header">
        <div className="chat-header-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-bn.png"
            alt="Banco de la Nación"
            className="chat-header-bn-logo"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="chat-header-divider" />
          <div className="banquito-avatar-sm">
            <BanquitoAvatar size={34} />
          </div>
          <div className="chat-header-text">
            <div className="chat-header-title">Banquito</div>
            <div className="chat-header-subtitle">Asistente de Gestión TI · Banco de la Nación</div>
          </div>
        </div>
        <div className="chat-header-actions">
          <Link href="/admin" className="btn-admin">⚙ Administrar</Link>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="chat-messages" role="log" aria-label="Conversación con Banquito">

        {messages.length === 0 && !isLoading && (
          <div className="chat-empty">
            <div className="banquito-welcome-avatar">
              <BanquitoAvatar size={120} />
              <div className="banquito-pulse" />
            </div>
            <h2 className="chat-empty-heading">¡Hola! Soy Banquito 👋</h2>
            <p className="chat-empty-sub">
              Tu asistente inteligente para la gestión de proyectos y demanda de TI
              del <strong>Banco de la Nación</strong>. ¿En qué puedo ayudarte hoy?
            </p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map(s => (
                <button key={s} className="suggestion-chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message-row message-row--${msg.role}`}
            onMouseEnter={() => msg.role === 'user' ? setHoveredId(msg.id) : undefined}
            onMouseLeave={() => setHoveredId(null)}
          >
            {/* Avatar */}
            <div className={`message-avatar message-avatar--${msg.role}`}>
              {msg.role === 'bot'
                ? <BanquitoAvatar size={32} />
                : <span style={{ fontSize: 14 }}>👤</span>
              }
            </div>

            {/* Content */}
            <div className="message-content">
              <div className="message-sender-row">
                <span className="message-sender">
                  {msg.role === 'user' ? 'Tú' : 'Banquito'}
                </span>
                {msg.role === 'user' && hoveredId === msg.id && editingId !== msg.id && (
                  <button
                    className="btn-edit-msg"
                    onClick={() => startEdit(msg)}
                    aria-label="Editar mensaje"
                    title="Editar y reenviar"
                  >
                    ✏️
                  </button>
                )}
              </div>
              <div className={`message-bubble message-bubble--${msg.role}${editingId === msg.id ? ' message-bubble--editing' : ''}`}>
                {msg.role === 'bot'
                  ? (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                    </div>
                  )
                  : msg.text
                }
                {msg.role === 'bot' && msg.sources && msg.sources.length > 0 && (
                  <div className="message-sources">
                    <span className="sources-label">Fuentes consultadas</span>
                    {msg.sources.map(s => (
                      <span key={s} className="source-tag">📄 {s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="message-row message-row--bot">
            <div className="message-avatar message-avatar--bot">
              <BanquitoAvatar size={32} />
            </div>
            <div className="message-content">
              <span className="message-sender">Banquito</span>
              <div className="typing-indicator">
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="chat-input-area">
        {editingId !== null && (
          <div className="edit-banner">
            ✏️ Editando mensaje —
            <button className="edit-cancel-btn" onClick={cancelEdit}>Cancelar</button>
          </div>
        )}
        {error && <div className="chat-error" role="alert">⚠ {error}</div>}
        <form className="chat-form" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(); }}
            onKeyDown={handleKeyDown}
            placeholder={editingId !== null
              ? 'Edita tu mensaje y presiona Enter...'
              : 'Consulta sobre proyectos, requerimientos o demanda TI...'}
            disabled={isLoading}
            rows={1}
            aria-label="Mensaje para Banquito"
          />
          <button
            type={isLoading ? 'button' : 'submit'}
            className={`chat-send-btn${editingId !== null && !isLoading ? ' chat-send-btn--edit' : ''}${isLoading ? ' chat-send-btn--stop' : ''}`}
            onClick={isLoading ? cancelRequest : undefined}
            disabled={!isLoading && !input.trim()}
            aria-label={isLoading ? 'Cancelar respuesta' : editingId !== null ? 'Reenviar mensaje editado' : 'Enviar consulta'}
          >
            {isLoading
              ? /* Ícono stop ■ */
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="2" y="2" width="12" height="12" rx="2"/>
                </svg>
              : editingId !== null
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            }
          </button>
        </form>
        <p className="chat-disclaimer">
          Banquito responde en base a documentos cargados por el equipo de TI · Banco de la Nación del Perú
        </p>
      </div>

    </div>
  );
}
