// YouTube como plataforma de vídeo do Portal (seção 10: "sem dependência de API").
// O vídeo fica no YouTube e o app o mostra pelo player embutido (youtube-nocookie).
// Título e canal vêm do oEmbed público do YouTube, que não pede chave nem conta.

export interface InfoVideo {
  titulo: string;
  canal: string | null;
}

/** Busca título e canal de um vídeo; null se o YouTube não responder ou o vídeo não existir. */
export type BuscarInfoVideo = (youtubeId: string) => Promise<InfoVideo | null>;

const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * ID do vídeo a partir do que o marketing colar: o ID puro ou um link
 * (youtube.com/watch?v=, youtu.be/, /shorts/, /embed/, /live/, m.youtube.com).
 */
export function extrairIdYoutube(entrada: string): string | null {
  const t = entrada.trim();
  if (ID.test(t)) return t;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, tipo, valor] = u.pathname.split('/');
    id = tipo === 'watch' ? u.searchParams.get('v') : tipo && ['shorts', 'embed', 'live', 'v'].includes(tipo) ? (valor ?? null) : null;
  }
  return id && ID.test(id) ? id : null;
}

/** "1:23", "01:02:03", "83" ou 83 → segundos. */
export function lerMomento(m: string | number | undefined): number {
  if (m === undefined || m === '') return 0;
  if (typeof m === 'number') return Math.max(0, Math.floor(m));
  const partes = m.trim().split(':').map(Number);
  if (partes.some((p) => !Number.isFinite(p) || p < 0)) throw new Error(`momento inválido: ${m}`);
  return partes.reduce((s, p) => s * 60 + p, 0);
}

/** 83 → "1:23"; 3723 → "1:02:03" (como o YouTube mostra os capítulos). */
export function formatarMomento(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${seg}` : `${m}:${seg}`;
}

export const buscarInfoYoutube: BuscarInfoVideo = async (id) => {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json()) as { title?: string; author_name?: string };
    return d.title ? { titulo: d.title.slice(0, 200), canal: d.author_name?.slice(0, 120) ?? null } : null;
  } catch {
    return null;
  }
};
