import type { Contexto } from './contexto.ts';
import { processarCampanhas } from './servicos/campanhas.ts';
import { despacharMensagens, lembrarRetiradas, processarEventoCrm } from './servicos/crm.ts';
import { despacharPush } from './servicos/push.ts';
import { expirarCobrancas, marcarNaoRetirados, publicarEventos } from './servicos/rotinas.ts';
import { lembrarVideos } from './servicos/videos.ts';

interface Log {
  info(o: object, msg: string): void;
  error(o: object, msg: string): void;
}

/** Um ciclo das rotinas: Pix expirado, lembretes, eventos do CRM, campanhas, mensagens e push. */
export async function rodarCiclo(ctx: Contexto, log: Log): Promise<void> {
  const expirados = await expirarCobrancas(ctx);
  const lembretes = await lembrarRetiradas(ctx);
  const naoRetirados = await marcarNaoRetirados(ctx);
  const lembretesVideo = await lembrarVideos(ctx);
  if (expirados || lembretes || naoRetirados || lembretesVideo) log.info({ expirados, lembretes, naoRetirados, lembretesVideo }, 'rotinas');
  await publicarEventos(ctx, async (e, q) => {
    await processarEventoCrm(q, ctx, e);
    log.info({ evento: e.tipo, id: e.id }, 'evento publicado');
  }, (e, erro) => log.error({ evento: e.tipo, id: e.id, err: erro }, 'falha ao publicar evento'));
  const camp = await processarCampanhas(ctx);
  if (camp.disparadas || camp.passos) log.info(camp, 'campanhas');
  const envio = await despacharMensagens(ctx, ctx.mensageiro);
  if (envio.enviadas || envio.bloqueadas || envio.falhas) log.info(envio, 'mensagens');
  const push = await despacharPush(ctx);
  if (push.enviadas || push.falhas) log.info(push, 'push');
}
