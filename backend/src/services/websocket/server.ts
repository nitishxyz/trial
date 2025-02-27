import { WebSocketServer, WebSocket } from "ws";
import { WalletMonitorServiceNew } from "../wallet/monitor-new";
import { db } from "../../db";
import { usersTable, tradesTable, pnlRecordsTable } from "../../db/schema";
import { eq, desc } from "drizzle-orm";
import { TokenMetadataService } from "../token/metadata";

interface ClientConnection {
  ws: WebSocket;
  walletAddresses: Set<string>;
  subscriptions: Set<string>;
}

export enum MessageType {
  SUBSCRIBE_WALLET = "SUBSCRIBE_WALLET",
  UNSUBSCRIBE_WALLET = "UNSUBSCRIBE_WALLET",
  TRADE_UPDATE = "TRADE_UPDATE",
  BALANCE_UPDATE = "BALANCE_UPDATE",
  PNL_UPDATE = "PNL_UPDATE",
  USERS_LIST = "USERS_LIST",
  USERS_UPDATE = "USERS_UPDATE",
  ERROR = "ERROR",
}

interface WebSocketMessage {
  type: MessageType;
  data: any;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private server: WebSocketServer;
  private clients: Map<WebSocket, ClientConnection> = new Map();
  private monitorService: WalletMonitorServiceNew;
  private tokenMetadataService: TokenMetadataService;

  private constructor(port: number = 8080) {
    this.server = new WebSocketServer({ port });

    // Use the new monitor service
    this.monitorService = WalletMonitorServiceNew.getInstance();
    this.tokenMetadataService = TokenMetadataService.getInstance();

    this.setupEventListeners();
    console.log(`🔌 WebSocket server started on port ${port}`);
  }

  public static getInstance(port?: number): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService(port);
    }
    return WebSocketService.instance;
  }

  private setupEventListeners(): void {
    this.server.on("connection", this.handleConnection.bind(this));
    this.monitorService.on("trade", this.handleTradeUpdate.bind(this));
    this.monitorService.on("balance", this.handleBalanceUpdate.bind(this));
    this.monitorService.on("pnl", this.handlePnLUpdate.bind(this));
  }

  private async handleConnection(ws: WebSocket): Promise<void> {
    console.log("New client connected");

    // Initialize client
    this.clients.set(ws, {
      ws,
      walletAddresses: new Set(),
      subscriptions: new Set(),
    });

    // Set up message handling
    ws.on("message", (message: string) => this.handleMessage(ws, message));

    // Handle disconnection
    ws.on("close", () => this.handleDisconnection(ws));

    // Send initial users list to client on connection
    await this.sendInitialUsersList(ws);
  }

  private async sendInitialUsersList(ws: WebSocket): Promise<void> {
    try {
      // Get active users with their today's data
      const users = await db
        .select()
        .from(usersTable)
        .orderBy(desc(usersTable.lastActive));

      // For each user, get their latest trade and daily PnL
      const usersWithData = await Promise.all(
        users.map(async (user) => {
          // Get latest trade
          const trades = await db
            .select()
            .from(tradesTable)
            .where(eq(tradesTable.walletAddress, user.walletAddress))
            .orderBy(desc(tradesTable.timestamp))
            .limit(1);

          let lastTrade = trades[0] || null;
          let tokenAMetadata = null;
          let tokenBMetadata = null;

          // Get token metadata if trade exists
          if (lastTrade) {
            tokenAMetadata = await this.tokenMetadataService.getTokenMetadata(
              lastTrade.tokenA
            );
            tokenBMetadata = await this.tokenMetadataService.getTokenMetadata(
              lastTrade.tokenB
            );
          }

          // Get today's PnL
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const pnl = await db
            .select()
            .from(pnlRecordsTable)
            .where(eq(pnlRecordsTable.walletAddress, user.walletAddress))
            .orderBy(desc(pnlRecordsTable.date))
            .limit(1);

          // If PnL record has lastTradeId, get that trade too
          let pnlLastTrade = null;
          let pnlTokenMetadata = null;

          if (pnl[0]?.lastTradeId) {
            const pnlTrades = await db
              .select()
              .from(tradesTable)
              .where(eq(tradesTable.id, pnl[0].lastTradeId))
              .limit(1);

            if (pnlTrades.length > 0) {
              pnlLastTrade = pnlTrades[0];
              // For simplicity, we'll just send the token that was bought/sold
              const tokenAddress =
                pnlLastTrade.type === "buy"
                  ? pnlLastTrade.tokenA
                  : pnlLastTrade.tokenB;
              pnlTokenMetadata =
                await this.tokenMetadataService.getTokenMetadata(tokenAddress);
            }
          }

          return {
            user,
            lastTrade: lastTrade
              ? {
                  ...lastTrade,
                  tokenAMetadata,
                  tokenBMetadata,
                }
              : null,
            dailyPnl: pnl[0] || null,
            balance: pnl[0]?.endBalance ? parseFloat(pnl[0].endBalance) : 0,
            pnlLastTrade: pnlLastTrade,
            pnlTokenMetadata: pnlTokenMetadata,
          };
        })
      );

      // Send the data to the client
      this.sendToClient(ws, {
        type: MessageType.USERS_LIST,
        data: usersWithData,
      });

      console.log(
        `Sent initial users list to client with ${usersWithData.length} users`
      );
    } catch (error) {
      console.error("Error sending initial users list:", error);
      this.sendError(ws, "Failed to fetch users data");
    }
  }

  private handleDisconnection(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (client) {
      // Cleanup subscriptions if needed
      this.clients.delete(ws);
      console.log("Client disconnected");
    }
  }

  private handleMessage(ws: WebSocket, messageData: string): void {
    try {
      const message = JSON.parse(messageData) as WebSocketMessage;
      const client = this.clients.get(ws);

      if (!client) {
        return;
      }

      switch (message.type) {
        case MessageType.SUBSCRIBE_WALLET:
          this.handleSubscribeWallet(client, message.data.walletAddress);
          break;
        case MessageType.UNSUBSCRIBE_WALLET:
          this.handleUnsubscribeWallet(client, message.data.walletAddress);
          break;
        default:
          this.sendError(ws, "Unknown message type");
      }
    } catch (error) {
      console.error("Error processing message:", error);
      this.sendError(ws, "Invalid message format");
    }
  }

  private handleSubscribeWallet(
    client: ClientConnection,
    walletAddress: string
  ): void {
    // Add wallet to client's subscriptions
    client.walletAddresses.add(walletAddress);
    client.subscriptions.add(`wallet:${walletAddress}`);

    console.log(`Client subscribed to wallet: ${walletAddress}`);

    // Confirm subscription
    this.sendToClient(client.ws, {
      type: MessageType.SUBSCRIBE_WALLET,
      data: {
        walletAddress,
        success: true,
      },
    });
  }

  private handleUnsubscribeWallet(
    client: ClientConnection,
    walletAddress: string
  ): void {
    // Remove wallet from client's subscriptions
    client.walletAddresses.delete(walletAddress);
    client.subscriptions.delete(`wallet:${walletAddress}`);

    console.log(`Client unsubscribed from wallet: ${walletAddress}`);

    // Confirm unsubscription
    this.sendToClient(client.ws, {
      type: MessageType.UNSUBSCRIBE_WALLET,
      data: {
        walletAddress,
        success: true,
      },
    });
  }

  private async handleTradeUpdate(
    walletAddress: string,
    tradeData: any
  ): Promise<void> {
    const subscribedClients = this.getSubscribedClients(walletAddress);

    // Send trade update to all subscribed clients
    subscribedClients.forEach((client) => {
      this.sendToClient(client.ws, {
        type: MessageType.TRADE_UPDATE,
        data: {
          walletAddress,
          trade: tradeData,
        },
      });
    });

    // Also broadcast to all clients for the users list update
    await this.broadcastUserUpdate(walletAddress);
  }

  private async handleBalanceUpdate(
    walletAddress: string,
    balanceData: any
  ): Promise<void> {
    // Broadcast balance update to all clients subscribed to this wallet
    this.broadcastToWalletSubscribers(walletAddress, {
      type: MessageType.BALANCE_UPDATE,
      data: {
        walletAddress,
        balance: balanceData,
      },
    });

    // Also broadcast updated user info to all clients
    await this.broadcastUserUpdate(walletAddress);
  }

  private async handlePnLUpdate(
    walletAddress: string,
    pnlData: any
  ): Promise<void> {
    // Broadcast PnL update to all clients subscribed to this wallet
    this.broadcastToWalletSubscribers(walletAddress, {
      type: MessageType.PNL_UPDATE,
      data: {
        walletAddress,
        pnl: pnlData,
      },
    });

    // Also broadcast updated user info to all clients
    await this.broadcastUserUpdate(walletAddress);
  }

  /**
   * Broadcast user update to all clients
   */
  private async broadcastUserUpdate(walletAddress: string): Promise<void> {
    try {
      // Get user data
      const user = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.walletAddress, walletAddress))
        .limit(1);

      if (user.length === 0) {
        return;
      }

      // Get latest trade
      const trades = await db
        .select()
        .from(tradesTable)
        .where(eq(tradesTable.walletAddress, walletAddress))
        .orderBy(desc(tradesTable.timestamp))
        .limit(1);

      let lastTrade = trades[0] || null;
      let tokenAMetadata = null;
      let tokenBMetadata = null;

      // Get token metadata if trade exists
      if (lastTrade) {
        tokenAMetadata = await this.tokenMetadataService.getTokenMetadata(
          lastTrade.tokenA
        );
        tokenBMetadata = await this.tokenMetadataService.getTokenMetadata(
          lastTrade.tokenB
        );
      }

      // Get daily PnL
      const pnl = await db
        .select()
        .from(pnlRecordsTable)
        .where(eq(pnlRecordsTable.walletAddress, walletAddress))
        .orderBy(desc(pnlRecordsTable.date))
        .limit(1);

      // If PnL record has lastTradeId, get that trade too
      let pnlLastTrade = null;
      let pnlTokenMetadata = null;

      if (pnl[0]?.lastTradeId) {
        const pnlTrades = await db
          .select()
          .from(tradesTable)
          .where(eq(tradesTable.id, pnl[0].lastTradeId))
          .limit(1);

        if (pnlTrades.length > 0) {
          pnlLastTrade = pnlTrades[0];
          // For simplicity, we'll just send the token that was bought/sold
          const tokenAddress =
            pnlLastTrade.type === "buy"
              ? pnlLastTrade.tokenA
              : pnlLastTrade.tokenB;
          pnlTokenMetadata = await this.tokenMetadataService.getTokenMetadata(
            tokenAddress
          );
        }
      }

      const userData = {
        user: user[0],
        lastTrade: lastTrade
          ? {
              ...lastTrade,
              tokenAMetadata,
              tokenBMetadata,
            }
          : null,
        dailyPnl: pnl[0] || null,
        balance: pnl[0]?.endBalance ? parseFloat(pnl[0].endBalance) : 0,
        pnlLastTrade: pnlLastTrade,
        pnlTokenMetadata: pnlTokenMetadata,
      };

      // Broadcast to all clients
      this.broadcastToAll({
        type: MessageType.USERS_UPDATE,
        data: userData,
      });

      console.log(`Broadcasted user update for ${walletAddress}`);
    } catch (error) {
      console.error("Error broadcasting user update:", error);
    }
  }

  private broadcastToWalletSubscribers(
    walletAddress: string,
    message: WebSocketMessage
  ): void {
    for (const [ws, client] of this.clients) {
      if (client.walletAddresses.has(walletAddress)) {
        this.sendToClient(ws, message);
      }
    }
  }

  private sendToClient(ws: WebSocket, message: WebSocketMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocket, errorMessage: string): void {
    this.sendToClient(ws, {
      type: MessageType.ERROR,
      data: {
        message: errorMessage,
      },
    });
  }

  private getSubscribedClients(walletAddress: string): ClientConnection[] {
    return Array.from(this.clients.values()).filter((client) =>
      client.walletAddresses.has(walletAddress)
    );
  }

  private broadcastToAll(message: WebSocketMessage): void {
    for (const [ws, client] of this.clients) {
      this.sendToClient(ws, message);
    }
  }
}
