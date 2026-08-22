import React, { useEffect, useState } from "react";
import { Download, Share2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { isTauriDesktopRuntime } from "@/lib/desktopApi";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari() {
  const userAgent = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
}

function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    if (isTauriDesktopRuntime()) return;
    setIos(isIosSafari());
    setInstalled(isStandalone());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setInstalled(false);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!ios && !deferredPrompt)) return null;

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  };

  if (deferredPrompt) {
    return <Button type="button" variant="ghost" onClick={() => void install()} aria-label="安裝 Fanfic Atlas 應用程式" className="h-9 rounded-xl bg-[color:var(--atlas-indigo-soft)] px-3 text-xs font-semibold text-[color:var(--atlas-indigo)] hover:bg-[color:var(--atlas-indigo)] hover:text-white"><Download className="mr-1.5 h-3.5 w-3.5" />安裝 App</Button>;
  }

  return <Dialog><DialogTrigger asChild><Button type="button" variant="ghost" aria-label="查看加入主畫面說明" className="h-9 rounded-xl bg-[color:var(--atlas-indigo-soft)] px-3 text-xs font-semibold text-[color:var(--atlas-indigo)] hover:bg-[color:var(--atlas-indigo)] hover:text-white"><Smartphone className="mr-1.5 h-3.5 w-3.5" />加入主畫面</Button></DialogTrigger><DialogContent className="max-w-sm rounded-3xl border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)] p-6"><DialogHeader><DialogTitle>安裝 Fanfic Atlas</DialogTitle><DialogDescription>在 Safari 開啟分享選單後，選擇「加入主畫面」，即可像一般應用程式般獨立開啟。</DialogDescription></DialogHeader><div className="mt-2 flex items-center gap-3 rounded-2xl bg-[color:var(--atlas-indigo-soft)] p-4 text-sm text-[color:var(--atlas-ink)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[color:var(--atlas-indigo)]"><Share2 className="h-4 w-4" /></span><span>Safari 分享按鈕 → 加入主畫面</span></div></DialogContent></Dialog>;
}
