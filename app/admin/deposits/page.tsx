"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
  updateDoc,
  doc,
  where,
  runTransaction,
  getDoc,
  increment,
  onSnapshot,
} from "firebase/firestore";
import { getFirebaseApp, getFirebaseFirestore } from "@/lib/firebaseClient";
import AdminLayout from "@/components/admin-layout";
import {
  CreditCard,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Filter,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

type DepositRequest = {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  method: string;
  status: "pending" | "approved" | "rejected";
  createdAt: Timestamp | any;
  proofUrl?: string;
  userEmail?: string; // We'll fetch this separately
};

const CURRENCY_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  USDT: "Tether (TRC20)",
  USDT_BEP20: "USDT (BEP20)",
};

export default function AdminDepositsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const buildAndSetDeposits = async (
    docs: Array<{ id: string; data: any }>,
  ) => {
    const db = getFirebaseFirestore();
    const depositsData = await Promise.all(
      docs.map(async (depositDoc) => {
        const data = depositDoc.data;
        let userEmail = "Unknown";

        try {
          if (data.userId) {
            const userDoc = await getDoc(doc(db, "users", data.userId));
            if (userDoc.exists()) {
              userEmail = userDoc.data().email || "Unknown";
            }
          }
        } catch (e) {
          console.error("Error fetching user email", e);
        }

        const createdAtFallback = data.createdAt
          ? data.createdAt
          : Timestamp.now();

        return {
          id: depositDoc.id,
          userId: data.userId || "",
          amount:
            typeof data.amount === "number" && !isNaN(data.amount)
              ? data.amount
              : 0,
          currency: data.currency || "USD",
          method: data.method || "",
          status:
            data.status === "approved" ||
            data.status === "rejected" ||
            data.status === "pending"
              ? data.status
              : ("pending" as const),
          createdAt: createdAtFallback,
          updatedAt: data.updatedAt || createdAtFallback,
          processedAt: data.processedAt,
          walletAddress: data.walletAddress || "",
          transactionHash: data.transactionHash || "",
          proofUrl: data.proofUrl,
          userEmail,
        } as DepositRequest;
      }),
    );

    depositsData.sort((a, b) => {
      const aTs = a.createdAt?.toDate
        ? a.createdAt.toDate().getTime()
        : new Date(a.createdAt || 0).getTime();
      const bTs = b.createdAt?.toDate
        ? b.createdAt.toDate().getTime()
        : new Date(b.createdAt || 0).getTime();
      return bTs - aTs;
    });

    setDeposits(depositsData);
  };

  useEffect(() => {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    const db = getFirebaseFirestore();
    let depositsUnsubscribe: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      try {
        const depositsQuery = query(
          collection(db, "deposits"),
          orderBy("createdAt", "desc"),
        );

        let firstLoadDone = false;
        depositsUnsubscribe = onSnapshot(
          depositsQuery,
          async (snapshot) => {
            try {
              const docs = snapshot.docs.map((d) => ({
                id: d.id,
                data: d.data(),
              }));
              await buildAndSetDeposits(docs);
            } catch (err) {
              console.error("Error processing deposits snapshot:", err);
            } finally {
              if (!firstLoadDone) {
                firstLoadDone = true;
                setLoading(false);
              }
              setRefreshing(false);
            }
          },
          (err) => {
            console.error("Error listening to deposits:", err);
            setLoading(false);
            setRefreshing(false);
          },
        );
      } catch (error) {
        console.error("Error setting up deposits listener:", error);
        setLoading(false);
        setRefreshing(false);
      }
    });

    return () => {
      if (depositsUnsubscribe) depositsUnsubscribe();
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      const db = getFirebaseFirestore();
      const depositsQuery = query(
        collection(db, "deposits"),
        orderBy("createdAt", "desc"),
      );
      const snapshot = await getDocs(depositsQuery);
      const docs = snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
      await buildAndSetDeposits(docs);
    } catch (err) {
      console.error("Error refreshing deposits:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleStatusUpdate = async (
    deposit: DepositRequest,
    newStatus: "approved" | "rejected",
  ) => {
    if (processingId) return;
    if (!confirm(`Are you sure you want to ${newStatus} this deposit?`)) return;

    setProcessingId(deposit.id);
    const db = getFirebaseFirestore();

    try {
      await runTransaction(db, async (transaction) => {
        const depositRef = doc(db, "deposits", deposit.id);
        const userRef = doc(db, "users", deposit.userId);

        const depositDoc = await transaction.get(depositRef);
        if (!depositDoc.exists()) {
          throw "Deposit document does not exist!";
        }

        if (depositDoc.data().status !== "pending") {
          throw "Deposit is already processed!";
        }

        const userDocSnapshot = await transaction.get(userRef);
        if (!userDocSnapshot.exists()) {
          throw "User document does not exist!";
        }

        const userData = userDocSnapshot.data();
        let referrerRef = null;
        let referrerDoc = null;

        // Prepare referrer update if applicable (Reads must be before Writes)
        if (
          newStatus === "approved" &&
          (userData.totalInvested || 0) === 0 &&
          userData.referredBy
        ) {
          referrerRef = doc(db, "users", userData.referredBy);
          referrerDoc = await transaction.get(referrerRef);
        }

        transaction.update(depositRef, {
          status: newStatus,
          processedAt: Timestamp.now(),
        });

        if (newStatus === "approved") {
          transaction.update(userRef, {
            balance: increment(deposit.amount),
            totalInvested: increment(deposit.amount),
            activeDeposits: increment(1),
          });

          // Apply Referral Bonus
          if (referrerDoc && referrerDoc.exists() && referrerRef) {
            const bonus = deposit.amount * 0.1; // 10% bonus
            transaction.update(referrerRef, {
              balance: increment(bonus),
              referralEarnings: increment(bonus),
            });
          }
        }
      });

      // Update local state
      setDeposits(
        deposits.map((d) =>
          d.id === deposit.id ? { ...d, status: newStatus } : d,
        ),
      );
    } catch (error) {
      console.error("Error updating deposit:", error);
      alert("Failed to update deposit status: " + error);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredDeposits = deposits.filter((deposit) => {
    if (filterStatus === "all") return true;
    return deposit.status === filterStatus;
  });

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  const VALID_ISO_CURRENCIES = new Set([
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "CAD",
    "AUD",
    "CHF",
    "CNY",
    "INR",
    "NGN",
    "KRW",
    "BRL",
  ]);

  const formatCurrency = (amount: number, currency?: string) => {
    const numericAmount =
      typeof amount === "number" && !isNaN(amount) ? amount : 0;

    let displayCurrency = "USD";
    if (
      currency &&
      typeof currency === "string" &&
      VALID_ISO_CURRENCIES.has(currency.toUpperCase())
    ) {
      displayCurrency = currency.toUpperCase();
    }

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: displayCurrency,
      }).format(numericAmount);
    } catch (err) {
      console.warn("formatCurrency fallback:", err);
      const formatted = numericAmount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      return displayCurrency === "USD"
        ? `$${formatted}`
        : `${displayCurrency} ${formatted}`;
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-full items-center justify-center">
          <div className="animate-pulse text-slate-400">
            Loading deposits...
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-7xl p-6 lg:p-8">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">
              Deposit Requests
            </h1>
            <p className="mt-2 text-slate-400">
              Manage and approve user deposits.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh deposits"
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              {refreshing ? "Refreshing..." : "Refresh"}
            </button>
            <Filter className="h-4 w-4 text-slate-500" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-xl border border-white/10 bg-slate-900 px-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/5 bg-slate-900 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-400">
              <thead className="bg-slate-950/50 text-xs uppercase text-slate-500">
                <tr>
                  <th scope="col" className="px-6 py-4 font-medium">
                    User
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Method
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredDeposits.length > 0 ? (
                  filteredDeposits.map((deposit) => (
                    <tr
                      key={deposit.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                            <CreditCard className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-200">
                              {deposit.userEmail}
                            </p>
                            <p className="text-xs text-slate-500">
                              ID: {deposit.id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-bold text-emerald-400">
                        {formatCurrency(deposit.amount, deposit.currency)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {deposit.method ||
                          CURRENCY_NAMES[deposit.currency] ||
                          deposit.currency}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {formatDate(deposit.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                            deposit.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-400"
                              : deposit.status === "rejected"
                                ? "bg-red-500/10 text-red-400"
                                : "bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {deposit.status === "pending" && (
                            <Clock className="h-3 w-3" />
                          )}
                          {deposit.status === "approved" && (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          {deposit.status === "rejected" && (
                            <XCircle className="h-3 w-3" />
                          )}
                          {deposit.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {deposit.status === "pending" && (
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() =>
                                handleStatusUpdate(deposit, "approved")
                              }
                              disabled={!!processingId}
                              className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
                              title="Approve Deposit"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() =>
                                handleStatusUpdate(deposit, "rejected")
                              }
                              disabled={!!processingId}
                              className="rounded-lg bg-red-500/10 p-2 text-red-400 transition hover:bg-red-500/20 disabled:opacity-50"
                              title="Reject Deposit"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                        {deposit.status !== "pending" && (
                          <span className="text-xs text-slate-600">
                            Processed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      No deposits found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
