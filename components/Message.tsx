'use client';

interface MessageProps {
  answer: string;
  sources: string[];
}

export default function Message({ answer, sources }: MessageProps) {
  return (
    <div className="message">
      <p className="answer">{answer}</p>
      {sources.length > 0 ? (
        <div className="sources">
          <span className="sources-label">Fuentes:</span>
          {sources.map((source) => (
            <span key={source} className="source-tag">
              {source}
            </span>
          ))}
        </div>
      ) : (
        <div className="sources sources--empty">
          <span className="sources-label">Sin fuentes disponibles</span>
        </div>
      )}
    </div>
  );
}
