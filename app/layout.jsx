import './globals.css';

export const metadata = {
  title: 'Agent Workspace',
  description: 'Git, kod ajanları ve proje notları için yerel çalışma alanı.',
};

export default function RootLayout({ children }) {
  return <html lang="tr"><body>{children}</body></html>;
}
