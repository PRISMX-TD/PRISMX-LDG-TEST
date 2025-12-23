import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  const updateServiceWorker = useCallback(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          window.location.reload();
        } else {
          window.location.reload();
        }
      });
    }
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (!registration) return;

        if (registration.waiting) {
          setNeedRefresh(true);
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setNeedRefresh(true);
            }
          });
        });
      });

      navigator.serviceWorker.ready.then(() => {
        // 离线就绪不显示提示
      });

      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setShowInstallButton(false);
    }
    setInstallPrompt(null);
  };

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
    setShowInstallButton(false);
  };

  if (!needRefresh && !offlineReady && !showInstallButton) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50",
        "bg-card/95 backdrop-blur-lg border border-border/50 rounded-xl shadow-lg",
        "p-4 animate-in slide-in-from-bottom-4 duration-300"
      )}
      data-testid="pwa-update-prompt"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
          {offlineReady ? (
            <Wifi className="h-5 w-5 text-primary" />
          ) : (
            <RefreshCw className="h-5 w-5 text-primary" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground">
            {offlineReady && '应用已准备好离线使用'}
            {needRefresh && '有新版本可用'}
            {showInstallButton && !needRefresh && !offlineReady && '安装 PRISMX Ledger'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {offlineReady && '您可以在没有网络连接的情况下使用基本功能'}
            {needRefresh && '点击刷新以获取最新版本'}
            {showInstallButton && !needRefresh && !offlineReady && '将应用添加到主屏幕，获得更好的体验'}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-6 w-6"
          onClick={close}
          data-testid="button-close-pwa-prompt"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex gap-2 mt-3">
        {needRefresh && (
          <Button
            size="sm"
            onClick={updateServiceWorker}
            className="flex-1"
            data-testid="button-refresh-pwa"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            立即刷新
          </Button>
        )}
        
        {showInstallButton && !needRefresh && (
          <Button
            size="sm"
            onClick={handleInstall}
            className="flex-1"
            data-testid="button-install-pwa"
          >
            安装应用
          </Button>
        )}
      </div>
    </div>
  );
}
