'use client';

import { useState, useEffect } from 'react';
import { useParams, notFound } from 'next/navigation';
import Image from 'next/image';
import WalletMonitor from '@/components/WalletMonitor';

interface User {
  id: number;
  displayName: string;
  walletAddress: string;
  avatarUrl: string | null;
  twitterHandle: string | null;
  streamUrl: string | null;
  isLive: boolean;
}

// Get random avatar URL for demo purposes
function getAvatarUrl(seed: string) {
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
}

// Generate a dummy user for development
function getDummyUser(walletAddress: string): User {
  return {
    id: 1,
    displayName: `Trader_${walletAddress.slice(0, 4)}`,
    walletAddress,
    avatarUrl: null,
    twitterHandle: 'trader_example',
    streamUrl: 'https://twitch.tv/example',
    isLive: Math.random() > 0.5,
  };
}

export default function TraderPage() {
  const { walletAddress } = useParams<{ walletAddress: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  useEffect(() => {
    async function fetchUserData() {
      try {
        // In a real app, this would be an API call to get user data
        // For now, we'll generate dummy data
        const dummyUser = getDummyUser(walletAddress);
        setUser(dummyUser);
      } catch (err) {
        console.error('Error fetching user data:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch user data'));
      } finally {
        setLoading(false);
      }
    }
    
    fetchUserData();
  }, [walletAddress]);
  
  // Show loading state
  if (loading) {
    return (
      <main className="min-h-screen p-4 md:p-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white shadow-md rounded-lg p-6 mb-8">
            <div className="animate-pulse flex flex-col md:flex-row items-center md:items-start gap-6">
              <div className="rounded-full bg-gray-200 h-32 w-32"></div>
              <div className="w-full">
                <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/4"></div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }
  
  // Handle error state
  if (error || !user) {
    notFound();
  }
  
  // Get avatar URL
  const avatarUrl = user.avatarUrl || getAvatarUrl(user.id.toString());
  
  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Trader profile header */}
        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="relative">
              <Image
                src={avatarUrl}
                alt={user.displayName}
                width={128}
                height={128}
                className="rounded-full border-4 border-gray-100"
              />
              {user.isLive && (
                <span className="absolute bottom-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                  LIVE
                </span>
              )}
            </div>
            
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-bold text-gray-900">{user.displayName}</h1>
              <p className="text-gray-500 mb-2">{walletAddress}</p>
              
              <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                {user.twitterHandle && (
                  <a 
                    href={`https://twitter.com/${user.twitterHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                  >
                    Twitter
                  </a>
                )}
                
                {user.streamUrl && (
                  <a 
                    href={user.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800"
                  >
                    Watch Stream
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Wallet monitor component for real-time data */}
        <WalletMonitor walletAddress={walletAddress} />
      </div>
    </main>
  );
}