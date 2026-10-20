import { Capacitor } from '@capacitor/core';

// Recursos do app instalado (Android e iOS, pelo Capacitor). No navegador nada disso roda:
// cada função devolve sem fazer nada, e as telas seguem com o que o navegador oferece.

export const ehAppInstalado = () => Capacitor.isNativePlatform();
const plataforma = () => Capacitor.getPlatform() as 'android' | 'ios' | 'web';

/** Lê um código de barras ou QR com o leitor nativo do aparelho. null se a pessoa cancelar. */
export async function lerCodigoNativo(): Promise<string | null> {
  const { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHintALLOption } = await import('@capacitor/barcode-scanner');
  try {
    const r = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
      scanInstructions: 'Aponte para o código de barras ou o QR',
      cancelButtonAccessibilityLabel: 'Cancelar leitura',
    });
    return r.ScanResult || null;
  } catch (e) {
    // Cancelar a leitura também chega como erro.
    if (/cancel/i.test(e instanceof Error ? e.message : String(e))) return null;
    throw e;
  }
}

const CHAVE_TOKEN_PUSH = 'pickgo.push.token';
export const EVENTO_ABRIR_PEDIDOS = 'pickgo:abrir-pedidos';

/**
 * Pede permissão de notificação e registra o aparelho na conta do cliente.
 * No Android o push precisa do google-services.json do Firebase no build
 * (VITE_PUSH_ANDROID=true); sem ele, o registro derrubaria o app.
 */
export async function registrarPush(registrar: (d: { plataforma: 'android' | 'ios'; token: string }) => Promise<unknown>): Promise<void> {
  const p = plataforma();
  if (p === 'web' || (p === 'android' && import.meta.env.VITE_PUSH_ANDROID !== 'true')) return;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener('registration', ({ value }) => {
    try {
      localStorage.setItem(CHAVE_TOKEN_PUSH, value);
    } catch {
      // sem armazenamento: o token só é usado para cancelar o registro ao sair
    }
    void registrar({ plataforma: p, token: value }).catch(() => undefined);
  });
  // Tocar na notificação abre "Meus pedidos".
  await PushNotifications.addListener('pushNotificationActionPerformed', () => {
    dispatchEvent(new CustomEvent(EVENTO_ABRIR_PEDIDOS));
  });
  await PushNotifications.register();
}

/** Ao sair da conta: o aparelho para de receber os avisos dela. */
export async function cancelarPush(remover: (token: string) => Promise<unknown>): Promise<void> {
  if (!ehAppInstalado()) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(CHAVE_TOKEN_PUSH);
    localStorage.removeItem(CHAVE_TOKEN_PUSH);
  } catch {
    // sem armazenamento
  }
  if (token) await remover(token).catch(() => undefined);
}
