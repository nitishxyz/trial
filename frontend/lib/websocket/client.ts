enum MessageType {
  SUBSCRIBE_WALLET = 'SUBSCRIBE_WALLET',
  UNSUBSCRIBE_WALLET = 'UNSUBSCRIBE_WALLET',
  TRADE_UPDATE = 'TRADE_UPDATE',
  BALANCE_UPDATE = 'BALANCE_UPDATE',
  PNL_UPDATE = 'PNL_UPDATE',
  USERS_LIST = 'USERS_LIST',
  USERS_UPDATE = 'USERS_UPDATE',
  ERROR = 'ERROR',
}

interface WebSocketMessage {
  type: MessageType;
  data: any;
}

type MessageHandler = (data: any) => void;

export class WebSocketClient {
  private socket: WebSocket | null = null;
  private url: string;
  private eventHandlers: Map<MessageType, Set<MessageHandler>> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private isConnected = false;
  
  constructor(url: string) {
    this.url = url;
    this.initEventHandlers();
  }
  
  private initEventHandlers() {
    Object.values(MessageType).forEach(type => {
      this.eventHandlers.set(type as MessageType, new Set());
    });
  }
  
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);
        
        this.socket.onopen = () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          resolve();
        };
        
        this.socket.onmessage = (event) => {
          const message = JSON.parse(event.data) as WebSocketMessage;
          this.handleMessage(message);
        };
        
        this.socket.onclose = () => {
          console.log('WebSocket disconnected, attempting to reconnect...');
          this.isConnected = false;
          this.scheduleReconnect();
        };
        
        this.socket.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        console.error('Error establishing WebSocket connection:', error);
        this.scheduleReconnect();
        reject(error);
      }
    });
  }
  
  private scheduleReconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...');
      this.connect().catch(error => {
        console.error('Reconnection attempt failed:', error);
      });
    }, 3000);
  }
  
  public disconnect() {
    if (this.socket && this.isConnected) {
      this.socket.close();
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }
  
  public on(type: MessageType, handler: MessageHandler) {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.add(handler);
    }
    return this; // For chaining
  }
  
  public off(type: MessageType, handler: MessageHandler) {
    const handlers = this.eventHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
    return this; // For chaining
  }
  
  private handleMessage(message: WebSocketMessage) {
    const handlers = this.eventHandlers.get(message.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(message.data);
        } catch (error) {
          console.error(`Error in handler for ${message.type}:`, error);
        }
      });
    }
  }
  
  public subscribeToWallet(walletAddress: string) {
    if (!this.socket || !this.isConnected) {
      console.error('Cannot subscribe: WebSocket not connected');
      return;
    }
    
    this.socket.send(JSON.stringify({
      type: MessageType.SUBSCRIBE_WALLET,
      data: {
        walletAddress
      }
    }));
  }
  
  public unsubscribeFromWallet(walletAddress: string) {
    if (!this.socket || !this.isConnected) {
      console.error('Cannot unsubscribe: WebSocket not connected');
      return;
    }
    
    this.socket.send(JSON.stringify({
      type: MessageType.UNSUBSCRIBE_WALLET,
      data: {
        walletAddress
      }
    }));
  }
}

// Export MessageType for use in components
export { MessageType };