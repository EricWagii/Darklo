/**
 * Web Serial API 类型定义
 */

interface SerialPortOpenOptions {
  baudRate: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
  bufferSize?: number;
  flowControl?: 'none' | 'hardware';
}

interface SerialPort {
  readable: ReadableStream<string> | null;
  writable: WritableStream<string> | null;
  open(options: SerialPortOpenOptions): Promise<void>;
  close(): Promise<void>;
  getInfo(): SerialPortInfo;
}

interface SerialPortInfo {
  usbVendorId?: number;
  usbProductId?: number;
}

interface Serial {
  requestPort(options?: { filters?: SerialPortFilter[] }): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
  onconnect: ((event: Event) => void) | null;
  ondisconnect: ((event: Event) => void) | null;
}

interface SerialPortFilter {
  usbVendorId?: number;
  usbProductId?: number;
}

declare global {
  interface Navigator {
    serial?: Serial;
  }
}

export {};
