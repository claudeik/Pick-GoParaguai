import { useEffect, useRef, useState } from 'react';
import { ehAppInstalado, lerCodigoNativo } from '../nativo.ts';

// Leitura de código de barras e QR pela câmera: no navegador, BarcodeDetector (Chrome e
// Android); no app instalado, o leitor nativo do ML Kit, que também funciona no iPhone.

interface DetectorDeCodigo {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (o?: { formats: string[] }) => DetectorDeCodigo;
  }
}

export const temCamera = () => ehAppInstalado() || (typeof window.BarcodeDetector === 'function' && !!navigator.mediaDevices);

export function LeitorCamera(props: { aoLer: (codigo: string) => void; aoFechar: () => void }) {
  return ehAppInstalado() ? <LeitorNativo {...props} /> : <LeitorNavegador {...props} />;
}

/** O leitor nativo abre em tela cheia e lê um código por vez. */
function LeitorNativo({ aoLer, aoFechar }: { aoLer: (codigo: string) => void; aoFechar: () => void }) {
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef({ aoLer, aoFechar });
  ref.current = { aoLer, aoFechar };

  useEffect(() => {
    let ativo = true;
    lerCodigoNativo()
      .then((v) => {
        if (!ativo) return;
        if (v) ref.current.aoLer(v);
        ref.current.aoFechar();
      })
      .catch((e: unknown) => ativo && setErro(e instanceof Error ? e.message : String(e)));
    return () => {
      ativo = false;
    };
  }, []);

  return erro ? (
    <div className="scanner">
      <p>Não foi possível abrir a câmera: {erro}</p>
      <button type="button" className="btn btn-sm btn-header-ghost" onClick={aoFechar}>
        Fechar
      </button>
    </div>
  ) : null;
}

function LeitorNavegador({ aoLer, aoFechar }: { aoLer: (codigo: string) => void; aoFechar: () => void }) {
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
