'use client';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const SCRIPT_ID = 'google-identity-services';

interface GoogleButtonProps {
  onCredential: (credential: string) => void;
}

export default function GoogleButton({ onCredential }: GoogleButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return; // not configured — button simply doesn't render

    function renderButton() {
      if (!window.google || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID as string,
        callback: (response) => onCredential(response.credential),
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'filled_black',
        size: 'large',
        width: 320,
        text: 'continue_with',
        shape: 'pill',
        locale: 'en',
      });
    }

    if (window.google) {
      renderButton();
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      // hl=en pins the button/popup text to English regardless of the
      // browser's detected locale
      script.src = 'https://accounts.google.com/gsi/client?hl=en';
      script.async = true;
      document.body.appendChild(script);
    }
    script.addEventListener('load', renderButton);
    return () => script?.removeEventListener('load', renderButton);
  }, [onCredential]);

  if (!GOOGLE_CLIENT_ID) return null;

  return (
    <div
      ref={buttonRef}
      style={{ display: 'flex', justifyContent: 'center', margin: '0.5rem 0' }}
    />
  );
}