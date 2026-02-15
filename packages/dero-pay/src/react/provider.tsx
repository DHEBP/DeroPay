/**
 * React context provider for DeroPay payment sessions.
 */

"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { Invoice, InvoiceStatus, WalletStatus } from "../core/types.js";
import { XSWDPayClient } from "../client/xswd-pay.js";
import { PaymentSession } from "../client/payment-session.js";

/** Context value for DeroPay */
export type DeroPayContextValue = {
  /** Current wallet connection status */
  walletStatus: WalletStatus;
  /** Connected wallet address */
  walletAddress: string | null;
  /** Current invoice being paid */
  currentInvoice: Invoice | null;
  /** Current invoice status */
  invoiceStatus: InvoiceStatus | null;
  /** Whether a payment operation is in progress */
  isLoading: boolean;
  /** Last error */
  error: string | null;
  /** Connect to the DERO wallet */
  connectWallet: () => Promise<string>;
  /** Disconnect the wallet */
  disconnectWallet: () => void;
  /** Start paying an invoice (fetches invoice and begins monitoring) */
  startPayment: (invoiceId: string) => Promise<void>;
  /** Pay an invoice directly from the connected wallet via XSWD */
  payWithWallet: () => Promise<string>;
  /** Stop the current payment session */
  stopPayment: () => void;
};

const DeroPayContext = createContext<DeroPayContextValue | null>(null);

/** Props for the DeroPayProvider */
export type DeroPayProviderProps = {
  children: ReactNode;
  /** XSWD WebSocket URL (default: ws://localhost:44326/xswd) */
  xswdUrl?: string;
  /** Application name shown in wallet connection dialog */
  appName?: string;
  /** Application description */
  appDescription?: string;
  /** Server endpoint for invoice status polling */
  statusEndpoint?: string;
  /** Polling interval in ms (default: 3000) */
  pollIntervalMs?: number;
  /** Callback when payment completes */
  onPaymentComplete?: (invoice: Invoice) => void;
  /** Callback when invoice expires */
  onPaymentExpired?: (invoice: Invoice) => void;
  /** Callback on error */
  onError?: (error: string) => void;
};

/**
 * Provider component that manages DeroPay payment state.
 *
 * ```tsx
 * <DeroPayProvider appName="My Store" statusEndpoint="/api/pay/status">
 *   <PaymentPage />
 * </DeroPayProvider>
 * ```
 */
export function DeroPayProvider({
  children,
  xswdUrl,
  appName,
  appDescription,
  statusEndpoint,
  pollIntervalMs,
  onPaymentComplete,
  onPaymentExpired,
  onError,
}: DeroPayProviderProps) {
  const [walletStatus, setWalletStatus] = useState<WalletStatus>("disconnected");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [currentInvoice, setCurrentInvoice] = useState<Invoice | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<XSWDPayClient | null>(null);
  const sessionRef = useRef<PaymentSession | null>(null);

  // Lazily create the XSWD client
  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new XSWDPayClient({
        url: xswdUrl,
        appName,
        appDescription,
      });
      clientRef.current.on("statusChange", setWalletStatus);
    }
    return clientRef.current;
  }, [xswdUrl, appName, appDescription]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      sessionRef.current?.stop();
    };
  }, []);

  const connectWallet = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const client = getClient();
      const address = await client.connect();
      setWalletAddress(address);
      return address;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to connect wallet";
      setError(msg);
      onError?.(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getClient, onError]);

  const disconnectWallet = useCallback(() => {
    clientRef.current?.disconnect();
    setWalletAddress(null);
    setWalletStatus("disconnected");
  }, []);

  const startPayment = useCallback(
    async (invoiceId: string) => {
      setError(null);
      setIsLoading(true);

      try {
        // Fetch the invoice from the server
        const endpoint = statusEndpoint ?? "/api/pay/status";
        const response = await fetch(
          `${endpoint}?invoiceId=${encodeURIComponent(invoiceId)}`
        );
        if (!response.ok) {
          throw new Error(`Failed to fetch invoice: HTTP ${response.status}`);
        }
        const invoice = (await response.json()) as Invoice;

        // Deserialize BigInt fields
        invoice.amount = BigInt(invoice.amount);
        invoice.amountReceived = BigInt(invoice.amountReceived);
        invoice.paymentId = BigInt(invoice.paymentId);

        setCurrentInvoice(invoice);
        setInvoiceStatus(invoice.status);

        // Stop any existing session
        sessionRef.current?.stop();

        // Start polling for status updates
        const session = new PaymentSession({
          invoiceId,
          statusEndpoint: endpoint,
          pollIntervalMs,
        });

        session.on("statusChanged", (status, updatedInvoice) => {
          setInvoiceStatus(status);
          setCurrentInvoice(updatedInvoice);
        });

        session.on("completed", (completedInvoice) => {
          setCurrentInvoice(completedInvoice);
          onPaymentComplete?.(completedInvoice);
        });

        session.on("expired", (expiredInvoice) => {
          setCurrentInvoice(expiredInvoice);
          onPaymentExpired?.(expiredInvoice);
        });

        session.on("error", (err) => {
          setError(err.message);
          onError?.(err.message);
        });

        sessionRef.current = session;
        session.start();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to start payment";
        setError(msg);
        onError?.(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [statusEndpoint, pollIntervalMs, onPaymentComplete, onPaymentExpired, onError]
  );

  const payWithWallet = useCallback(async () => {
    if (!currentInvoice) {
      throw new Error("No active invoice. Call startPayment first.");
    }

    const client = getClient();
    if (client.getStatus() !== "connected") {
      throw new Error("Wallet not connected. Call connectWallet first.");
    }

    setIsLoading(true);
    setError(null);

    try {
      const txid = await client.transfer(
        currentInvoice.integratedAddress,
        currentInvoice.amount - currentInvoice.amountReceived
      );
      return txid;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transfer failed";
      setError(msg);
      onError?.(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [currentInvoice, getClient, onError]);

  const stopPayment = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setCurrentInvoice(null);
    setInvoiceStatus(null);
  }, []);

  const value: DeroPayContextValue = {
    walletStatus,
    walletAddress,
    currentInvoice,
    invoiceStatus,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    startPayment,
    payWithWallet,
    stopPayment,
  };

  return (
    <DeroPayContext.Provider value={value}>{children}</DeroPayContext.Provider>
  );
}

/**
 * Hook to access the DeroPay context.
 * Must be used within a `<DeroPayProvider>`.
 */
export function useDeroPayContext(): DeroPayContextValue {
  const ctx = useContext(DeroPayContext);
  if (!ctx) {
    throw new Error(
      "useDeroPayContext must be used within a <DeroPayProvider>"
    );
  }
  return ctx;
}
