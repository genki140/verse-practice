import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
export function usePwa(isSaving: () => boolean) {
  const reloading = useRef(false);
  const requestReload = () => {
    if (reloading.current) return;
    reloading.current = true;
    const reload = () => {
      if (isSaving()) setTimeout(reload, 50);
      else location.reload();
    };
    reload();
  };
  const [error, setError] = useState(false);
  const [cached, setCached] = useState(false);
  const pwa = useRegisterSW({
    onNeedReload: requestReload,
    onOfflineReady() {
      setCached(true);
    },
    onRegisterError() {
      setError(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      if (registration.active) setCached(true);
      const trackInstall = () => {
        const worker = registration.installing;
        if (worker)
          worker.addEventListener("statechange", () => {
            if (worker.state === "redundant" && !registration.active)
              setError(true);
          });
      };
      registration.addEventListener("updatefound", trackInstall);
      trackInstall();
      let last = 0;
      const check = () => {
        if (
          document.visibilityState === "visible" &&
          navigator.onLine &&
          Date.now() - last >= 3600000
        ) {
          last = Date.now();
          void registration.update().catch(() => {});
        }
      };
      check();
      window.addEventListener("online", check);
      document.addEventListener("visibilitychange", check);
    },
  });
  const [install, setInstall] = useState<any>(null);
  useEffect(() => {
    const f = (e: Event) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  return {
    ...pwa,
    updateServiceWorker: async () => {
      const registration = await navigator.serviceWorker.getRegistration(
        import.meta.env.BASE_URL,
      );
      if (!registration?.waiting)
        throw Error(
          "更新を再確認してください。新しい版はまだ準備できていません。",
        );
      navigator.serviceWorker.addEventListener(
        "controllerchange",
        requestReload,
        { once: true },
      );
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    },
    ready: cached || pwa.offlineReady[0],
    error,
    install,
    installApp: async () => {
      if (install) {
        await install.prompt();
        setInstall(null);
      }
    },
  };
}
