import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Banquito — Banco de la Nación',
  description: 'Asistente virtual del Banco de la Nación del Perú',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
