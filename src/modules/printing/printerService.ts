import { ReceiptData } from '../../types/models';
import { buildPrintableSummary, formatCurrency } from '../sales/utils';

export type PrinterConnectionType = 'usb' | 'bluetooth';

type PrinterState = {
  connected: boolean;
  connectionType: PrinterConnectionType;
};

const printerState: PrinterState = {
  connected: true,
  connectionType: 'usb',
};

function formatTicket(receipt: ReceiptData): string {
  const date = new Date(receipt.createdAt).toLocaleString('es-AR');
  const items = receipt.items.map((item) => ({
    name: item.name,
    qty: item.qty,
    unitPrice: Math.round(item.subtotal / item.qty),
    productId: item.name,
  }));

  return [
    'CLUB - BUFFET',
    `Operacion: ${receipt.saleId}`,
    `Fecha: ${date}`,
    `Pago: ${receipt.paymentMethod}`,
    '----------------',
    buildPrintableSummary(items, receipt.total),
    '----------------',
    `TOTAL ${formatCurrency(receipt.total)}`,
    'Gracias!',
  ].join('\n');
}

export function getPrinterState(): PrinterState {
  return { ...printerState };
}

export function setPrinterConnectionStatus(connected: boolean) {
  printerState.connected = connected;
}

export function setPrinterConnectionType(connectionType: PrinterConnectionType) {
  printerState.connectionType = connectionType;
}

export async function printReceipt(
  receipt: ReceiptData,
): Promise<{ ok: true; preview: string; via: PrinterConnectionType }> {
  if (!printerState.connected) {
    throw new Error('PRINTER_OFFLINE');
  }

  const preview = formatTicket(receipt);

  return { ok: true, preview, via: printerState.connectionType };
}
