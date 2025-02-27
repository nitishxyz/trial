'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';

interface Balance {
  solBalance: number;
  tokens: Array<{ mint: string; amount: number }>;
  timestamp: string;
}

interface Trade {
  id: number;
  signature: string;
  tokenA: string;
  tokenB: string;
  type: string;
  amountA: string;
  amountB: string;
  platform: string;
  timestamp: string;
}

interface PnL {
  id: number;
  walletAddress: string;
  date: string;
  startBalance: string;
  endBalance: string;
  realizedPnl: string;
  totalTrades: number;
  timestamp?: string;
}

interface WalletMonitorProps {
  walletAddress: string;
}

export default function WalletMonitor({ walletAddress }: WalletMonitorProps) {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [pnl, setPnl] = useState<PnL | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Use the WebSocket hook for real-time updates
  const {
    isConnected,
    error: wsError,
    subscribeToWallet,
    unsubscribeFromWallet,
    onTradeUpdate,
    onBalanceUpdate,
    onPnlUpdate,
    onUsersList
  } = useWebSocket();
  
  // Subscribe to WebSocket events when connected
  useEffect(() => {
    if (isConnected) {
      // Subscribe to this wallet
      subscribeToWallet(walletAddress);
      
      // Add WebSocket event listeners
      const tradeCleanup = onTradeUpdate((data) => {
        if (data.walletAddress === walletAddress) {
          setTrades(prev => [data.trade, ...prev.slice(0, 9)]);
        }
      });
      
      const balanceCleanup = onBalanceUpdate((data) => {
        if (data.walletAddress === walletAddress) {
          setBalance(data.balance);
        }
      });
      
      const pnlCleanup = onPnlUpdate((data) => {
        if (data.walletAddress === walletAddress) {
          setPnl({
            id: data.pnl.id || 0,
            walletAddress: data.pnl.walletAddress,
            date: data.pnl.date,
            startBalance: data.pnl.startBalance.toString(),
            endBalance: data.pnl.currentBalance.toString(),
            realizedPnl: data.pnl.realizedPnl.toString(),
            totalTrades: data.pnl.totalTrades,
            timestamp: data.pnl.timestamp
          });
        }
      });
      
      // Get initial data from users list
      const usersListCleanup = onUsersList((usersData) => {
        const userData = usersData.find((user: any) => 
          user.user.walletAddress === walletAddress
        );
        
        if (userData) {
          // Set the initial data from users list
          if (userData.lastTrade) {
            setTrades([userData.lastTrade]);
          }
          
          if (userData.dailyPnl) {
            setPnl(userData.dailyPnl);
          }
          
          if (userData.balance) {
            setBalance({
              solBalance: userData.balance,
              tokens: [],
              timestamp: new Date().toISOString()
            });
          }
          
          setIsLoading(false);
        }
      });
      
      // Cleanup subscriptions when component unmounts
      return () => {
        unsubscribeFromWallet(walletAddress);
        tradeCleanup();
        balanceCleanup();
        pnlCleanup();
        usersListCleanup();
      };
    }
  }, [
    isConnected, 
    walletAddress, 
    subscribeToWallet, 
    unsubscribeFromWallet, 
    onTradeUpdate, 
    onBalanceUpdate, 
    onPnlUpdate,
    onUsersList
  ]);
  
  // Handle websocket errors
  useEffect(() => {
    if (wsError) {
      setError('WebSocket connection error: ' + wsError.message);
      setIsLoading(false);
    }
  }, [wsError]);
  
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
        {/* Loading skeleton */}
        <div className="p-4 bg-white shadow-md rounded-lg">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
          </div>
        </div>
        <div className="p-4 bg-white shadow-md rounded-lg">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-2"></div>
          </div>
        </div>
      </div>
    );
  }
  
  if (error || wsError) {
    return (
      <div className="p-4 bg-red-50 border border-red-300 rounded-md text-red-800 mb-4">
        <p className="font-medium">Error: {error || wsError}</p>
        <p className="text-sm mt-1">Try refreshing the page. If the error persists, please contact support.</p>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
      {/* Balance Section */}
      <div className="p-4 bg-white shadow-md rounded-lg">
        <h2 className="text-xl font-bold mb-4">Wallet Balance</h2>
        {balance ? (
          <div>
            <div className="mb-2">
              <span className="font-medium">SOL:</span> {balance.solBalance.toFixed(4)}
            </div>
            {balance.tokens && balance.tokens.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Tokens:</h3>
                <ul className="space-y-1">
                  {balance.tokens.map((token) => (
                    <li key={token.mint} className="text-sm">
                      {token.mint}: {token.amount.toFixed(4)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs text-gray-500 mt-2">
              Last updated: {new Date(balance.timestamp).toLocaleTimeString()}
            </div>
          </div>
        ) : (
          <p>No balance data available</p>
        )}
      </div>
      
      {/* PnL Section */}
      <div className="p-4 bg-white shadow-md rounded-lg">
        <h2 className="text-xl font-bold mb-4">Today's PnL</h2>
        {pnl ? (
          <div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="font-medium">Start Balance:</span> {parseFloat(pnl.startBalance).toFixed(4)} SOL
              </div>
              <div>
                <span className="font-medium">Current Balance:</span> {parseFloat(pnl.endBalance).toFixed(4)} SOL
              </div>
              <div>
                <span className="font-medium">Realized PnL:</span> 
                <span className={`ml-1 ${parseFloat(pnl.realizedPnl) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {parseFloat(pnl.realizedPnl) >= 0 ? '+' : ''}{parseFloat(pnl.realizedPnl).toFixed(4)} SOL
                </span>
              </div>
              <div>
                <span className="font-medium">Trades Today:</span> {pnl.totalTrades}
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-2">
              Last updated: {pnl.timestamp ? new Date(pnl.timestamp).toLocaleTimeString() : 'N/A'}
            </div>
          </div>
        ) : (
          <p>No PnL data available</p>
        )}
      </div>
      
      {/* Recent Trades Section */}
      <div className="col-span-1 lg:col-span-2 p-4 bg-white shadow-md rounded-lg">
        <h2 className="text-xl font-bold mb-4">Recent Trades</h2>
        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Token</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {trades.map((trade) => (
                  <tr key={trade.signature}>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {new Date(trade.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        trade.type === 'buy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {trade.type.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      SOL
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {parseFloat(trade.amountA).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                      {trade.platform}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No recent trades found</p>
        )}
      </div>
    </div>
  );
}