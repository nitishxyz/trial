"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

// Define shapes for our data types
interface User {
  id: number;
  displayName: string;
  walletAddress: string;
  avatarUrl: string | null;
  streamUrl: string | null;
  isLive: boolean;
  lastActive: string | null;
}

interface Trade {
  id: number;
  signature: string;
  tokenA: string;
  tokenB: string;
  type: string;
  amountA: string;
  amountB: string;
  timestamp: string;
}

interface PnlRecord {
  id: number;
  walletAddress: string;
  date: string;
  startBalance: string;
  endBalance: string;
  realizedPnl: string;
  totalTrades: number;
}

interface UserWithData {
  user: User;
  lastTrade: Trade | null;
  dailyPnl: PnlRecord | null;
  balance: number;
}

function getRandomAvatarUrl(seed: number) {
  return `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}`;
}

// Animated number component to animate changing numbers
const AnimatedValue = ({
  value,
  positive,
}: {
  value: string;
  positive?: boolean;
}) => {
  return (
    <motion.span
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`font-mono ${
        positive !== undefined
          ? positive
            ? "text-emerald-400"
            : "text-rose-400"
          : "text-zinc-100"
      }`}
    >
      {value}
    </motion.span>
  );
};

const TraderCard = ({
  data,
  index,
  hasChanged,
  prevUsersRef,
}: {
  data: UserWithData;
  index: number;
  hasChanged: (
    wallet: string,
    field: keyof UserWithData,
    nested?: string
  ) => boolean;
  prevUsersRef: React.RefObject<Record<string, UserWithData>>;
}) => {
  const pnlValue = data.dailyPnl ? parseFloat(data.dailyPnl.realizedPnl) : 0;
  const isPnlPositive = pnlValue >= 0;
  const hasPnlChanged = hasChanged(
    data.user.walletAddress,
    "dailyPnl",
    "realizedPnl"
  );
  const hasTradeChanged = hasChanged(
    data.user.walletAddress,
    "lastTrade",
    "type"
  );

  // Get previous PnL value to determine if it increased or decreased
  const getPnlChangeDirection = () => {
    const prevUser = prevUsersRef.current[data.user.walletAddress];
    if (!prevUser?.dailyPnl) return null;

    const prevPnl = parseFloat(prevUser.dailyPnl.realizedPnl);
    const currentPnl = parseFloat(data.dailyPnl?.realizedPnl || "0");

    return currentPnl > prevPnl ? "increase" : "decrease";
  };

  const pnlChangeDirection = hasPnlChanged ? getPnlChangeDirection() : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group relative flex items-center gap-6 rounded-lg bg-zinc-900/50 p-4 hover:bg-zinc-800/50 transition-all duration-200 overflow-hidden mt-2"
      onClick={() =>
        (window.location.href = `/trader/${data.user.walletAddress}`)
      }
    >
      {/* Enhanced highlight animation on PnL change */}
      {hasPnlChanged && (
        <motion.div
          className={`absolute inset-0 ${
            pnlChangeDirection === "increase" ? "bg-emerald-500" : "bg-rose-500"
          }`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.15, 0],
          }}
          transition={{
            duration: 1,
            ease: "easeOut",
          }}
        />
      )}

      {/* Trade change highlight */}
      {hasTradeChanged && (
        <motion.div
          className={`absolute inset-0 ${
            data.lastTrade?.type === "buy" ? "bg-emerald-500" : "bg-rose-500"
          }`}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.15, 0],
          }}
          transition={{
            duration: 1,
            ease: "easeOut",
          }}
        />
      )}

      {/* Trader Info */}
      <div className="flex-shrink-0 relative z-10">
        <motion.div whileHover={{ scale: 1.05 }} className="relative h-12 w-12">
          <Image
            src={data.user.avatarUrl || ""}
            alt={data.user.displayName}
            width={48}
            height={48}
            className="rounded-full ring-2 ring-zinc-700/50 group-hover:ring-zinc-600/50"
          />
          {data.user.isLive && (
            <motion.div
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 ring-2 ring-zinc-900"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [1, 0.8, 1],
              }}
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: "easeInOut",
              }}
            />
          )}
        </motion.div>
      </div>

      {/* Trader Details */}
      <div className="flex flex-1 items-center justify-between z-10">
        <div className="min-w-[140px]">
          <h3 className="font-medium text-zinc-100">{data.user.displayName}</h3>
          <p className="text-sm text-zinc-400">
            {data.user.walletAddress.slice(0, 4)}...
            {data.user.walletAddress.slice(-4)}
          </p>
        </div>

        {/* Last Trade with enhanced animation */}
        <div className="min-w-[200px]">
          {data.lastTrade ? (
            <motion.div
              animate={
                hasTradeChanged
                  ? {
                      scale: [1, 1.05, 1],
                      transition: { duration: 0.3 },
                    }
                  : {}
              }
            >
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  data.lastTrade.type === "buy"
                    ? "bg-emerald-400/10 text-emerald-400 ring-1 ring-emerald-400/30"
                    : "bg-rose-400/10 text-rose-400 ring-1 ring-rose-400/30"
                }`}
              >
                {data.lastTrade.type.toUpperCase()}
              </span>
              <p className="mt-1 text-sm text-zinc-400">
                {formatDistanceToNow(new Date(data.lastTrade.timestamp), {
                  addSuffix: true,
                })}
              </p>
            </motion.div>
          ) : (
            <span className="text-sm text-zinc-500">No recent trades</span>
          )}
        </div>

        {/* Balance with animation */}
        <div className="min-w-[120px] text-right">
          <motion.div
            animate={
              hasChanged(data.user.walletAddress, "balance")
                ? {
                    scale: [1, 1.05, 1],
                    transition: { duration: 0.3 },
                  }
                : {}
            }
          >
            <AnimatedValue value={`${data.balance.toFixed(2)} SOL`} />
          </motion.div>
        </div>

        {/* PnL with enhanced animation */}
        <div className="min-w-[120px] text-right">
          <motion.div
            animate={
              hasPnlChanged
                ? {
                    scale: [1, 1.05, 1],
                    transition: { duration: 0.3 },
                  }
                : {}
            }
          >
            <AnimatedValue
              value={`${isPnlPositive ? "+" : ""}${pnlValue.toFixed(2)} SOL`}
              positive={isPnlPositive}
            />
          </motion.div>
        </div>
      </div>

      {/* Hover effect overlay */}
      <motion.div
        className="absolute inset-0 bg-zinc-800/0 group-hover:bg-zinc-800/50 transition-colors duration-200"
        initial={false}
        exit={{ opacity: 0 }}
      />
    </motion.div>
  );
};

export default function ActiveTraders() {
  const [users, setUsers] = useState<UserWithData[]>([]);
  const [sortedUsers, setSortedUsers] = useState<UserWithData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUsersRef = useRef<Record<string, UserWithData>>({});

  // Get the WebSocket connection
  const {
    isConnected,
    error: wsError,
    onUsersList,
    onUserUpdate,
  } = useWebSocket();

  // Sort users by PnL (highest to lowest)
  useEffect(() => {
    if (users.length === 0) return;

    // Store previous state for comparison
    const prevUsersMap = sortedUsers.reduce((acc, user) => {
      acc[user.user.walletAddress] = user;
      return acc;
    }, {} as Record<string, UserWithData>);

    prevUsersRef.current = prevUsersMap;

    // Sort users by PnL from highest positive to lowest negative
    const sorted = [...users].sort((a, b) => {
      const pnlA = a.dailyPnl ? parseFloat(a.dailyPnl.realizedPnl) : 0;
      const pnlB = b.dailyPnl ? parseFloat(b.dailyPnl.realizedPnl) : 0;
      return pnlB - pnlA;
    });

    setSortedUsers(sorted);
  }, [users]);

  // Set up WebSocket event handlers
  useEffect(() => {
    if (!isConnected) return;

    // Handle initial users list
    const usersListCleanup = onUsersList((usersData) => {
      const enhancedUsers = usersData.map((userData: UserWithData) => ({
        ...userData,
        user: {
          ...userData.user,
          avatarUrl:
            userData.user.avatarUrl || getRandomAvatarUrl(userData.user.id),
        },
      }));

      setUsers(enhancedUsers);
      setIsLoading(false);
    });

    // Handle user updates
    const userUpdateCleanup = onUserUpdate((userData: UserWithData) => {
      setUsers((prevUsers) => {
        // Find and update the user in the array
        const userIndex = prevUsers.findIndex(
          (u) => u.user.walletAddress === userData.user.walletAddress
        );

        if (userIndex === -1) {
          // New user, add to the array
          return [
            ...prevUsers,
            {
              ...userData,
              user: {
                ...userData.user,
                avatarUrl:
                  userData.user.avatarUrl ||
                  getRandomAvatarUrl(userData.user.id),
              },
            },
          ];
        } else {
          // Existing user, update it
          const updatedUsers = [...prevUsers];
          updatedUsers[userIndex] = {
            ...userData,
            user: {
              ...userData.user,
              avatarUrl:
                userData.user.avatarUrl || getRandomAvatarUrl(userData.user.id),
            },
          };
          return updatedUsers;
        }
      });
    });

    // Clean up handlers when component unmounts
    return () => {
      usersListCleanup();
      userUpdateCleanup();
    };
  }, [isConnected, onUsersList, onUserUpdate]);

  // Handle websocket errors
  useEffect(() => {
    if (wsError) {
      setError("WebSocket connection error: " + wsError.message);
      setIsLoading(false);
    }
  }, [wsError]);

  // Check if a value has changed for animation purposes
  const hasValueChanged = (
    walletAddress: string,
    field: keyof UserWithData,
    nestedField?: string
  ) => {
    const prevUser = prevUsersRef.current[walletAddress];
    if (!prevUser) return false;

    const currentUser = sortedUsers.find(
      (u) => u.user.walletAddress === walletAddress
    );
    if (!currentUser) return false;

    // For nested fields, handle each case properly with type safety
    if (nestedField) {
      if (field === "user" && prevUser.user && currentUser.user) {
        return (
          prevUser.user[nestedField as keyof User] !==
          currentUser.user[nestedField as keyof User]
        );
      }
      if (
        field === "lastTrade" &&
        prevUser.lastTrade &&
        currentUser.lastTrade
      ) {
        return (
          prevUser.lastTrade[nestedField as keyof Trade] !==
          currentUser.lastTrade[nestedField as keyof Trade]
        );
      }
      if (field === "dailyPnl" && prevUser.dailyPnl && currentUser.dailyPnl) {
        return (
          prevUser.dailyPnl[nestedField as keyof PnlRecord] !==
          currentUser.dailyPnl[nestedField as keyof PnlRecord]
        );
      }
      return false;
    } else {
      // For top-level fields, direct comparison is fine
      return prevUser[field] !== currentUser[field];
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-lg bg-zinc-900/50 p-4">
            <div className="flex items-center gap-6">
              <div className="h-12 w-12 rounded-full bg-zinc-800" />
              <div className="flex-1 space-y-3">
                <div className="h-4 w-24 rounded bg-zinc-800" />
                <div className="h-3 w-32 rounded bg-zinc-800" />
              </div>
              <div className="h-8 w-24 rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg bg-zinc-900/50 p-8">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-zinc-300">
            Connection Error
          </h3>
          <p className="mt-2 text-sm text-zinc-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-zinc-900/30 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <h2 className="text-lg font-medium text-zinc-100">Active Traders</h2>
        <div className="flex items-center gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Buy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-rose-400" />
            <span>Sell</span>
          </div>
        </div>
      </div>

      {/* Traders List */}
      <div className="p-4">
        <LayoutGroup>
          <AnimatePresence mode="popLayout">
            {sortedUsers.map((userData, index) => (
              <TraderCard
                key={userData.user.walletAddress}
                data={userData}
                index={index}
                hasChanged={hasValueChanged}
                prevUsersRef={prevUsersRef}
              />
            ))}
          </AnimatePresence>
        </LayoutGroup>
      </div>
    </div>
  );
}
