/* Last-resort boundary: an error in the root layout itself (providers, i18n)
   replaces the whole document, so this renders its own <html>/<body> and can't
   rely on next-intl or the UI kit's providers. Plain English on purpose. */
"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>DevDigest hit an unexpected error</h1>
          <p style={{ color: "#666", marginBottom: 16 }}>Reload the app to continue.</p>
          <button type="button" onClick={reset} style={{ padding: "8px 16px", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
