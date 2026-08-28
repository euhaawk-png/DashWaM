"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    FB?: {
      init: (opts: Record<string, unknown>) => void;
      login: (cb: (response: FbLoginResponse) => void, opts: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type FbLoginResponse = { authResponse?: { code?: string } | null; status?: string };

/**
 * Meta Embedded Signup v4. The popup returns the WABA/phone ids via a
 * postMessage (WA_EMBEDDED_SIGNUP) and the auth code via FB.login's callback;
 * both are sent to /api/wa/es-callback to finish the connection server-side.
 */
export function EmbeddedSignupButton({ appId, configId }: { appId: string; configId: string }) {
  const router = useRouter();
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signupData = useRef<{ wabaId?: string; phoneNumberId?: string }>({});

  useEffect(() => {
    if (window.FB) {
      setSdkReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: "v23.0" });
      setSdkReady(true);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, [appId]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          signupData.current = {
            wabaId: data.data?.waba_id,
            phoneNumberId: data.data?.phone_number_id,
          };
        }
      } catch {
        /* non-JSON messages from the SDK are expected */
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const launch = useCallback(() => {
    if (!window.FB) return;
    setError(null);
    setBusy(true);
    window.FB.login(
      async (response) => {
        const code = response.authResponse?.code;
        const { wabaId, phoneNumberId } = signupData.current;
        if (!code || !wabaId || !phoneNumberId) {
          setBusy(false);
          setError("Conexão cancelada ou incompleta. Tente novamente.");
          return;
        }
        try {
          const res = await fetch("/api/wa/es-callback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, wabaId, phoneNumberId }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? "Falha na conexão");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Falha na conexão.");
        } finally {
          setBusy(false);
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      }
    );
  }, [configId, router]);

  return (
    <div>
      <button type="button" className="btn-primary" disabled={!sdkReady || busy} onClick={launch}>
        {busy ? "Conectando…" : "Conectar WhatsApp"}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <p className="mt-2 text-xs text-muted">
        Você fará login no Facebook e escolherá (ou criará) a conta WhatsApp Business da empresa.
        Se o número hoje é usado no app WhatsApp Business, ele será migrado para a API — as conversas
        do celular não são importadas e o app deixa de funcionar para esse número.
      </p>
    </div>
  );
}
