import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { Config } from './config.ts';
import type { Db } from './db.ts';
import { invalido } from './erros.ts';
import type { Usuario } from './auth.ts';
import type { GestorIdentidade } from './integracoes/identidade.ts';
import type { Mensageiro } from './integracoes/mensageria.ts';
import type { ProvedorPix } from './integracoes/pix.ts';

/** Dependências compartilhadas pelas rotas e rotinas. `agora` é injetável nos testes. */
export interface Contexto {
  db: Db;
  config: Config;
  pix: ProvedorPix;
  agora: () => Date;
  /** Usuários da equipe: Keycloak, ou memória nos testes e no modo demonstração. */
  identidade: GestorIdentidade;
  /** WhatsApp, SMS e e-mail: Twilio, ou simulado sem credenciais. */
  mensageiro: Mensageiro;
  /** Valida tokens do Keycloak; ausente quando o Keycloak não está configurado. */
  verificarOidc?: (token: string) => Promise<Usuario | null>;
}

/** Um módulo registra as rotas de um domínio (catálogo, pedidos, pagamentos...). */
export type Modulo = (app: FastifyInstance, ctx: Contexto) => void;

/** Valida a entrada com zod; erro vira 422 com a lista de campos. */
export function validar<T extends z.ZodType>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados);
  if (!r.success) {
    throw invalido('dados inválidos', {
      campos: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
    });
  }
  return r.data;
}
