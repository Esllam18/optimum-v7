import Script from 'next/script';

export default function HomePage() {
  return (
    <>
      <div id="app" data-app-scope="client" aria-live="polite" />
      <div id="portal" />
      <Script src="/assets/app.js?v=6.9.0" type="module" strategy="afterInteractive" />
    </>
  );
}
