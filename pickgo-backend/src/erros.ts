/** Erro HTTP no formato problem+json (RFC 9457). */
export class ErroHttp extends Error {
  status: number;
  tipo: string;
  extras: Record<string, unknown> | undefined;

  constructor(status: number, tipo: string, detalhe: string, extras?: Record<string, unknown>) {
    super(detalhe);
    this.status = status;
    this.tipo = tipo;
    this.extras = extras;
  }
}

export const naoEncontrado = (o_que: string) => new ErroHttp(404, 'nao-encontrado', `${o_que} não encontrado`);
export const conflito = (tipo: string, detalhe: string, extras?: Record<string, unknown>) =>
  new ErroHttp(409, tipo, detalhe, extras);
export const invalido = (detalhe: string, extras?: Record<string, unknown>) =>
  new ErroHttp(422, 'requisicao-invalida', detalhe, extras);
export const proibido = (detalhe = 'perfil sem permissão para esta ação') => new ErroHttp(403, 'proibido', detalhe);
