// Deklarasi tipe minimal untuk `midtrans-client` (paket tanpa TypeScript types).
// Hanya bagian yang dipakai proyek: pembuatan transaksi Snap & pengecekan status
// via Core API. Rujukan API: https://github.com/Midtrans/midtrans-nodejs-client

declare module 'midtrans-client' {
  interface MidtransClientOptions {
    isProduction?: boolean;
    serverKey?: string;
    clientKey?: string;
  }

  /** Respons transaksi Snap — hanya field yang kita pakai; sisanya bebas. */
  interface SnapCreateTransactionResponse {
    token: string;
    redirect_url: string;
    [key: string]: unknown;
  }

  /** Respons status transaksi Core API — bentuk longgar (field bervariasi per channel). */
  interface TransactionStatusResponse {
    order_id?: string;
    transaction_status?: string;
    payment_type?: string;
    gross_amount?: string;
    status_code?: string;
    fraud_status?: string;
    va_numbers?: Array<{ bank?: string; va_number?: string }>;
    [key: string]: unknown;
  }

  class Transaction {
    status(transactionId: string): Promise<TransactionStatusResponse>;
    statusb2b(transactionId: string): Promise<TransactionStatusResponse>;
    approve(transactionId: string): Promise<TransactionStatusResponse>;
    deny(transactionId: string): Promise<TransactionStatusResponse>;
    cancel(transactionId: string): Promise<TransactionStatusResponse>;
    expire(transactionId: string): Promise<TransactionStatusResponse>;
    notification(payload: unknown): Promise<TransactionStatusResponse>;
  }

  export class Snap {
    constructor(options?: MidtransClientOptions);
    readonly transaction: Transaction;
    createTransaction(parameter: Record<string, unknown>): Promise<SnapCreateTransactionResponse>;
    createTransactionToken(parameter: Record<string, unknown>): Promise<string>;
    createTransactionRedirectUrl(parameter: Record<string, unknown>): Promise<string>;
  }

  export class CoreApi {
    constructor(options?: MidtransClientOptions);
    readonly transaction: Transaction;
    charge(parameter: Record<string, unknown>): Promise<Record<string, unknown>>;
    capture(parameter: Record<string, unknown>): Promise<Record<string, unknown>>;
  }

  export class MidtransError extends Error {
    httpStatusCode?: number;
    ApiResponse?: unknown;
    rawHttpClientData?: unknown;
  }
}
