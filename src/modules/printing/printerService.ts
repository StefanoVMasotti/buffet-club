import { PrintersDiscovery, DiscoveryFilterOption, Printer, PrinterConstants } from 'react-native-esc-pos-printer';

import { ReceiptData } from '../../types/models';
import { buildPrintableSummary, formatCurrency } from '../sales/utils';

export type PrinterConnectionType = 'usb' | 'bluetooth';

type PrinterState = {
  connected: boolean;
  connectionType: PrinterConnectionType;
};

type DiscoveredPrinter = {
  target: string;
  deviceName: string;
};

const printerState: PrinterState = {
  connected: true,
  connectionType: 'usb',
};

let activeUsbPrinter: Printer | null = null;
let activeUsbTarget: string | null = null;

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

async function discoverUsbPrinters(timeoutMs = 3500): Promise<DiscoveredPrinter[]> {
  return new Promise(async (resolve, reject) => {
    let cleanupDiscovery: (() => void) | undefined;
    let cleanupError: (() => void) | undefined;

    try {
      cleanupDiscovery = PrintersDiscovery.onDiscovery((devices) => {
        const usbDevices = devices
          .filter((d) => d.target?.startsWith('USB:'))
          .map((d) => ({ target: d.target, deviceName: d.deviceName || 'USB Printer' }));

        resolve(usbDevices);
      });

      cleanupError = PrintersDiscovery.onError((error) => {
        reject(error);
      });

      await PrintersDiscovery.start({
        timeout: timeoutMs,
        autoStop: true,
        filterOption: {
          portType: DiscoveryFilterOption.PORTTYPE_USB,
          epsonFilter: DiscoveryFilterOption.FILTER_NONE,
        },
      });

      setTimeout(() => resolve([]), timeoutMs + 300);
    } catch (error) {
      reject(error);
    } finally {
      setTimeout(() => {
        cleanupDiscovery?.();
        cleanupError?.();
      }, timeoutMs + 500);
    }
  });
}

async function ensureUsbPrinterConnected(): Promise<Printer> {
  if (activeUsbPrinter && activeUsbTarget) {
    return activeUsbPrinter;
  }

  const printers = await discoverUsbPrinters();

  if (!printers.length) {
    throw new Error('USB_PRINTER_NOT_FOUND');
  }

  const selected = printers[0];

  const printer = new Printer({
    target: selected.target,
    deviceName: selected.deviceName,
    lang: PrinterConstants.MODEL_ANK,
  });

  await printer.connect(7000);

  activeUsbPrinter = printer;
  activeUsbTarget = selected.target;

  return printer;
}

async function printViaUsb(receipt: ReceiptData): Promise<void> {
  const printer = await ensureUsbPrinterConnected();
  const lines = formatTicket(receipt).split('\n');

  for (const line of lines) {
    await printer.addText(`${line}\n`);
  }

  await printer.addFeedLine(2);
  await printer.addCut(PrinterConstants.CUT_FEED);
  await printer.sendData(15000);
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

export async function resetUsbConnection() {
  if (activeUsbPrinter) {
    try {
      await activeUsbPrinter.disconnect();
    } catch (_error) {
      // ignore disconnect failures, we'll recreate connection on next print
    }
  }

  activeUsbPrinter = null;
  activeUsbTarget = null;
}

export async function printReceipt(
  receipt: ReceiptData,
): Promise<{ ok: true; preview: string; via: PrinterConnectionType }> {
  if (!printerState.connected) {
    throw new Error('PRINTER_OFFLINE');
  }

  const preview = formatTicket(receipt);

  if (printerState.connectionType === 'usb') {
    await printViaUsb(receipt);
    return { ok: true, preview, via: 'usb' };
  }

  return { ok: true, preview, via: 'bluetooth' };
}
