import { PrintersDiscovery, DiscoveryFilterOption, Printer, PrinterConstants } from 'react-native-esc-pos-printer';

import { ReceiptData } from '../../types/models';

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
let lastDiscoveredUsbPrinters: DiscoveredPrinter[] = [];

function expandTicketUnits(receipt: ReceiptData): string[] {
  const units: string[] = [];
  for (const item of receipt.items) {
    for (let i = 0; i < item.qty; i += 1) {
      units.push(item.name);
    }
  }
  return units;
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

export async function scanUsbPrinters(timeoutMs = 3500): Promise<DiscoveredPrinter[]> {
  const printers = await discoverUsbPrinters(timeoutMs);
  lastDiscoveredUsbPrinters = printers;
  return printers;
}

export function getLastDiscoveredUsbPrinters(): DiscoveredPrinter[] {
  return [...lastDiscoveredUsbPrinters];
}

export function getActiveUsbPrinterTarget(): string | null {
  return activeUsbTarget;
}

export async function selectUsbPrinterTarget(target: string): Promise<void> {
  if (activeUsbTarget === target) {
    return;
  }
  await resetUsbConnection();
  activeUsbTarget = target;
}

async function ensureUsbPrinterConnected(): Promise<Printer> {
  if (activeUsbPrinter && activeUsbTarget) {
    return activeUsbPrinter;
  }

  let targetToUse = activeUsbTarget;

  if (!targetToUse) {
    const printers = await discoverUsbPrinters();
    if (!printers.length) {
      throw new Error('USB_PRINTER_NOT_FOUND');
    }
    targetToUse = printers[0].target;
  }

  const selected =
    lastDiscoveredUsbPrinters.find((p) => p.target === targetToUse) ??
    { target: targetToUse, deviceName: 'USB Printer' };

  if (!selected?.target) {
    throw new Error('USB_PRINTER_NOT_FOUND');
  }

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
  const units = expandTicketUnits(receipt);

  for (const productName of units) {
    await printer.addTextAlign(PrinterConstants.ALIGN_CENTER);
    await printer.addTextSize({ width: 2, height: 2 });
    await printer.addText(`${productName}\n`);
    await printer.addFeedLine(3);
    await printer.addCut(PrinterConstants.CUT_FEED);
  }
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
  const preview = expandTicketUnits(receipt).join('\n');

  if (printerState.connectionType === 'usb') {
    await printViaUsb(receipt);
    return { ok: true, preview, via: 'usb' };
  }

  return { ok: true, preview, via: 'bluetooth' };
}
