import './globals.css';

export const metadata = {
  title: 'Optimum',
  description: 'Optimum operations platform for files, work management and CAD engineering',
  icons: { icon: '/favicon.svg' },
  manifest: '/app.webmanifest'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f7fb' },
    { media: '(prefers-color-scheme: dark)', color: '#07111f' }
  ]
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
