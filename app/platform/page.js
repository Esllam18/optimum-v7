import Script from 'next/script';

export const metadata = {
  title: 'Optimum Platform Console',
  description: 'Private Optimum company provisioning and subscription console'
};

export default function PlatformPage() {
  return (
    <>
      <div id="app" data-app-scope="platform" aria-live="polite" />
      <div id="portal" />
      <Script src="/assets/platform.js?v=6.9.0" type="module" strategy="afterInteractive" />
    </>
  );
}
