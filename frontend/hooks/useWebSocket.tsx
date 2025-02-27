import { useEffect, useState, useCallback, useRef } from "react";
import { WebSocketClient, MessageType } from "@/lib/websocket/client";

// Make sure this matches your environment setup
const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://codelab.li-piano.ts.net:8080";

export function useWebSocket() {
  const clientRef = useRef<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize the connection
  useEffect(() => {
    const client = new WebSocketClient(WS_URL);
    clientRef.current = client;

    const connectWs = async () => {
      try {
        await client.connect();
        setIsConnected(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Failed to connect"));
        setIsConnected(false);
      }
    };

    connectWs();

    // Cleanup
    return () => {
      client.disconnect();
    };
  }, []);

  // Subscribe to a wallet
  const subscribeToWallet = useCallback(
    (walletAddress: string) => {
      if (clientRef.current && isConnected) {
        clientRef.current.subscribeToWallet(walletAddress);
      } else {
        console.error("Cannot subscribe: WebSocket not connected");
      }
    },
    [isConnected]
  );

  // Unsubscribe from a wallet
  const unsubscribeFromWallet = useCallback(
    (walletAddress: string) => {
      if (clientRef.current && isConnected) {
        clientRef.current.unsubscribeFromWallet(walletAddress);
      } else {
        console.error("Cannot unsubscribe: WebSocket not connected");
      }
    },
    [isConnected]
  );

  // Listen for trade updates
  const onTradeUpdate = useCallback((handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(MessageType.TRADE_UPDATE, handler);
    }

    // Return a cleanup function
    return () => {
      if (clientRef.current) {
        clientRef.current.off(MessageType.TRADE_UPDATE, handler);
      }
    };
  }, []);

  // Listen for balance updates
  const onBalanceUpdate = useCallback((handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(MessageType.BALANCE_UPDATE, handler);
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.off(MessageType.BALANCE_UPDATE, handler);
      }
    };
  }, []);

  // Listen for PNL updates
  const onPnlUpdate = useCallback((handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(MessageType.PNL_UPDATE, handler);
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.off(MessageType.PNL_UPDATE, handler);
      }
    };
  }, []);

  // Listen for initial users list
  const onUsersList = useCallback((handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(MessageType.USERS_LIST, handler);
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.off(MessageType.USERS_LIST, handler);
      }
    };
  }, []);

  // Listen for user updates
  const onUserUpdate = useCallback((handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(MessageType.USERS_UPDATE, handler);
    }

    return () => {
      if (clientRef.current) {
        clientRef.current.off(MessageType.USERS_UPDATE, handler);
      }
    };
  }, []);

  return {
    isConnected,
    error,
    subscribeToWallet,
    unsubscribeFromWallet,
    onTradeUpdate,
    onBalanceUpdate,
    onPnlUpdate,
    onUsersList,
    onUserUpdate,
  };
}
