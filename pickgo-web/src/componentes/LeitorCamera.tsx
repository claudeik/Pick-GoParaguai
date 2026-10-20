import { useEffect, useRef, useState } from 'react';

// Leitura de código de barras e QR pela câmera (BarcodeDetector do navegador).

interface DetectorDeCodigo {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats: string[] }) => DetectorDeCodigo;
  }
}

export const temCamera = () => typeof window.BarcodeDetector === 'function' && !!navigator.mediaDevices;

export function LeitorCamera({ aoLer, aoFechar }: { aoLer: (codigo: string) => void; aoFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const aoLerRef = useRef(aoLer);
  aoLerRef.current = aoLer;

  useEffect(() => {
    let fluxo: MediaStream | null = null;
    let parar = false;
    let ultimo = '';
    (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!video.current) return;
        video.current.srcObject = fluxo;
        await video.current.play();
        const detector = new window.BarcodeDetector!({ formats: ['ean_13', 'ean_8', 'code_128', 'upc_a', 'qr_code'] });
        while (!parar) {
          const r = await detector.detect(video.current);
          const v = r[0]?.rawValue;
          if (v && v !== ultimo) {
            ultimo = v;
            aoLerRef.current(v);
          }
          await new Promise((ok) => setTimeout(ok, 400));
        }
      } catch (e) {
        setErro(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      parar = true;
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="scanner">
      {erro ? <p>Não foi possível abrir a câmera: {erro}</p> : <video ref={video} className="video-scanner" muted playsInline />}
      <button type="button" className="btn btn-sm btn-header-ghost" onClick={aoFechar}>
        Fechar câmera
      </button>
    </div>
  );
}
