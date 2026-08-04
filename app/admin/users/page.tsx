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
  runTransaction,
  addDoc,
} from "firebase/firestore";
import { getFirebaseApp, getFirebaseFirestore } from "@/lib/firebaseClient";
import AdminLayout from "@/components/admin-layout";
import {
  Users,
  Search,
  MoreVertical,
  Shield,
  Ban,
  CheckCircle,
  Mail,
  Calendar,
  MapPin,
  Plus,
  Minus,
  X,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

type UserData = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  createdAt?: Timestamp | any;
  balance?: number;
  status?: "active" | "banned";
  registrationLocation?: {
    ip?: string;
    city?: string;
    region?: string;
    country?: string;
    provider?: string;
  };
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [balanceModal, setBalanceModal] = useState<{
    open: boolean;
    user: UserData | null;
    mode: "add" | "remove";
    amount: string;
    note: string;
    processing: boolean;
    error: string;
  }>({
    open: false,
    user: null,
    mode: "add",
    amount: "",
    note: "",
    processing: false,
    error: "",
  });

  const openBalanceModal = (user: UserData, mode: "add" | "remove") => {
    setBalanceModal({
      open: true,
      user,
      mode,
      amount: "",
      note: "",
      processing: false,
      error: "",
    });
  };

  const closeBalanceModal = () => {
    if (balanceModal.processing) return;
    setBalanceModal({
      open: false,
      user: null,
      mode: "add",
      amount: "",
      note: "",
      processing: false,
      error: "",
    });
  };

  const applyBalanceAdjustment = async () => {
    if (!balanceModal.user) return;

    const amountNum = parseFloat(balanceModal.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setBalanceModal((s) => ({
        ...s,
        error: "Enter a valid amount greater than 0.",
      }));
      return;
    }

    const user = balanceModal.user;
    const db = getFirebaseFirestore();
    const userRef = doc(db, "users", user.id);
    const adjustmentType = balanceModal.mode; // "add" | "remove"

    if (
      adjustmentType === "remove" &&
      (user.balance || 0) < amountNum &&
      !window.confirm(
        `User's current balance (${formatCurrency(user.balance)}) is less than the amount to remove (${formatCurrency(amountNum)}). The user will go negative. Continue?`,
      )
    ) {
      return;
    }

    let finalNewBalance = user.balance || 0;
    let app = getFirebaseApp();
    let adminEmail = getAuth(app).currentUser?.email || "unknown-admin";

    setBalanceModal((s) => ({ ...s, processing: true, error: "" }));

    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) throw new Error("User no longer exists.");

        const currentBalance: number =
          typeof userDoc.data().balance === "number"
            ? userDoc.data().balance
            : 0;
        const delta = adjustmentType === "add" ? amountNum : -amountNum;
        finalNewBalance = currentBalance + delta;

        transaction.update(userRef, {
          balance: finalNewBalance,
          lastBalanceAdjustmentAt: Timestamp.now(),
          lastBalanceAdjustmentBy: adminEmail,
        });
      });

      // Write an audit log (best-effort, non-fatal on failure)
      try {
        await addDoc(collection(db, "adminBalanceAdjustments"), {
          userId: user.id,
          userEmail: user.email,
          adminEmail,
          type: adjustmentType,
          amount: amountNum,
          delta: adjustmentType === "add" ? amountNum : -amountNum,
          previousBalance: user.balance || 0,
          newBalance: finalNewBalance,
          note:
            balanceModal.note || balanceModal.mode === "add"
              ? "Manual balance credit (admin)"
              : "Manual balance debit (admin)",
          createdAt: Timestamp.now(),
        });
      } catch (logErr) {
        console.error("Failed to write adjustment log:", logErr);
      }

      // Update local state immediately so table reflects change
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, balance: finalNewBalance } : u,
        ),
      );

      setBalanceModal((s) => ({
        open: false,
        user: null,
        mode: "add",
        amount: "",
        note: "",
        processing: false,
        error: "",
      }));
    } catch (err) {
      console.error("Balance adjustment failed:", err);
      setBalanceModal((s) => ({
        ...s,
        processing: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to update balance. Please try again.",
      }));
    }
  };

  useEffect(() => {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    const db = getFirebaseFirestore();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }

      try {
        const usersQuery = query(collection(db, "users"));
        const snapshot = await getDocs(usersQuery);

        const fetchedUsers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserData[];

        setUsers(fetchedUsers);
        setFilteredUsers(fetchedUsers);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!searchTerm) {
      setFilteredUsers(users);
    } else {
      const lowerTerm = searchTerm.toLowerCase();
      setFilteredUsers(
        users.filter(
          (user) =>
            user.email?.toLowerCase().includes(lowerTerm) ||
            user.firstName?.toLowerCase().includes(lowerTerm) ||
            user.lastName?.toLowerCase().includes(lowerTerm),
        ),
      );
    }
  }, [searchTerm, users]);

  const toggleUserStatus = async (userId: string, currentStatus?: string) => {
    const newStatus = currentStatus === "banned" ? "active" : "banned";
    try {
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, "users", userId), {
        status: newStatus,
      });

      // Update local state
      setUsers(
        users.map((u) => (u.id === userId ? { ...u, status: newStatus } : u)),
      );
    } catch (error) {
      console.error("Error updating user status:", error);
      alert("Failed to update user status");
    }
  };

  const toggleAdminRole = async (user: UserData) => {
    const currentlyAdmin = user.role === "admin";
    const action = currentlyAdmin ? "revoke admin from" : "promote to admin";
    if (!window.confirm(`Are you sure you want to ${action} ${user.email}?`))
      return;

    const app = getFirebaseApp();
    const actorEmail = getAuth(app).currentUser?.email || "unknown-admin";
    const newRole: "admin" | "user" = currentlyAdmin ? "user" : "admin";

    try {
      const db = getFirebaseFirestore();
      await updateDoc(doc(db, "users", user.id), {
        role: newRole,
        roleUpdatedAt: Date.now(),
        roleUpdatedBy: actorEmail,
      });

      // Audit log (best-effort)
      try {
        await addDoc(collection(db, "adminRoleChanges"), {
          targetUserId: user.id,
          targetUserEmail: user.email,
          previousRole: currentlyAdmin ? "admin" : user.role || "user",
          newRole,
          changedBy: actorEmail,
          createdAt: Timestamp.now(),
        });
      } catch (logErr) {
        console.error("Role change log write failed:", logErr);
      }

      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, role: newRole } : u)),
      );
    } catch (error) {
      console.error("Error updating user role:", error);
      alert("Failed to update admin role");
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return "N/A";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(date);
  };

  const formatCurrency = (amount?: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex h-full items-center justify-center">
          <div className="animate-pulse text-slate-400">Loading users...</div>
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
              User Management
            </h1>
            <p className="mt-2 text-slate-400">
              View and manage all registered users.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 pl-10 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 sm:w-64"
            />
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
                    Role
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Balance
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Joined
                  </th>
                  <th scope="col" className="px-6 py-4 font-medium">
                    Location
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
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="whitespace-nowrap px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400 font-bold uppercase">
                            {user.firstName?.[0] || user.email?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-slate-200">
                              {user.firstName
                                ? `${user.firstName} ${user.lastName || ""}`
                                : "No Name"}
                            </p>
                            <p className="text-xs text-slate-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {user.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            <Shield className="h-3 w-3" /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                            User
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-200">
                        {formatCurrency(user.balance)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        {user.registrationLocation ? (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1 text-xs text-slate-200">
                              <MapPin className="h-3 w-3 text-emerald-500" />
                              {user.registrationLocation.city ||
                                "Unknown"},{" "}
                              {user.registrationLocation.country || "Unknown"}
                            </div>
                            <p className="text-[10px] text-slate-500">
                              IP: {user.registrationLocation.ip || "N/A"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600 italic">
                            No location data
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            user.status === "banned"
                              ? "bg-red-500/10 text-red-400"
                              : "bg-emerald-500/10 text-emerald-400"
                          }`}
                        >
                          {user.status || "active"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openBalanceModal(user, "add")}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                            title="Add money to user balance"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </button>
                          <button
                            onClick={() => openBalanceModal(user, "remove")}
                            className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-amber-400 transition hover:bg-amber-500/20"
                            title="Remove money from user balance"
                          >
                            <Minus className="h-3.5 w-3.5" />
                            Remove
                          </button>
                          <button
                            onClick={() => toggleAdminRole(user)}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                              user.role === "admin"
                                ? "bg-slate-700/60 text-slate-200 hover:bg-slate-700"
                                : "bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25"
                            }`}
                            title={
                              user.role === "admin"
                                ? "Demote from Admin"
                                : "Promote to Admin"
                            }
                          >
                            {user.role === "admin" ? (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Admin
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Make Admin
                              </>
                            )}
                          </button>
                          <button
                            onClick={() =>
                              toggleUserStatus(user.id, user.status)
                            }
                            className={`rounded-lg p-2 transition ${
                              user.status === "banned"
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-red-400 hover:bg-red-500/10"
                            }`}
                            title={
                              user.status === "banned"
                                ? "Unban User"
                                : "Ban User"
                            }
                          >
                            {user.status === "banned" ? (
                              <CheckCircle className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {balanceModal.open && balanceModal.user && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={closeBalanceModal}
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
              <div
                className={`flex items-center justify-between border-b border-white/5 p-6 ${
                  balanceModal.mode === "add" ? "" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                      balanceModal.mode === "add"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {balanceModal.mode === "add" ? (
                      <Plus className="h-5 w-5" />
                    ) : (
                      <Minus className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-50">
                      {balanceModal.mode === "add"
                        ? "Add Money to Balance"
                        : "Remove Money from Balance"}
                    </h2>
                    <p className="text-xs text-slate-500">
                      {balanceModal.user.firstName
                        ? `${balanceModal.user.firstName} ${balanceModal.user.lastName || ""} · `
                        : ""}
                      {balanceModal.user.email}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeBalanceModal}
                  disabled={balanceModal.processing}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-5 p-6">
                <div className="flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-4 py-3">
                  <span className="text-sm font-medium text-slate-400">
                    Current Balance
                  </span>
                  <span className="text-lg font-bold text-slate-50">
                    {formatCurrency(balanceModal.user.balance)}
                  </span>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Amount (USD)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={balanceModal.amount}
                    onChange={(e) =>
                      setBalanceModal((s) => ({
                        ...s,
                        amount: e.target.value,
                        error: "",
                      }))
                    }
                    placeholder="0.00"
                    disabled={balanceModal.processing}
                    className="block w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-lg font-semibold text-slate-50 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                  />
                  {balanceModal.amount &&
                  !isNaN(parseFloat(balanceModal.amount)) &&
                  parseFloat(balanceModal.amount) > 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      New balance after{" "}
                      <span
                        className={
                          balanceModal.mode === "add"
                            ? "font-semibold text-emerald-400"
                            : "font-semibold text-amber-400"
                        }
                      >
                        {balanceModal.mode === "add" ? "+" : "-"}
                        {formatCurrency(parseFloat(balanceModal.amount))}
                      </span>
                      :{" "}
                      <span className="font-semibold text-slate-200">
                        {formatCurrency(
                          (balanceModal.user.balance || 0) +
                            (balanceModal.mode === "add" ? 1 : -1) *
                              parseFloat(balanceModal.amount),
                        )}
                      </span>
                    </p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-300">
                    Note / Reason{" "}
                    <span className="text-slate-500">(optional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={balanceModal.note}
                    onChange={(e) =>
                      setBalanceModal((s) => ({ ...s, note: e.target.value }))
                    }
                    placeholder="e.g. Manual bonus, correction for failed deposit, etc."
                    disabled={balanceModal.processing}
                    className="block w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-slate-200 placeholder-slate-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-60"
                  />
                </div>

                {balanceModal.error && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{balanceModal.error}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-white/5 bg-slate-950/40 p-6">
                <button
                  onClick={closeBalanceModal}
                  disabled={balanceModal.processing}
                  className="rounded-xl border border-white/10 bg-transparent px-5 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={applyBalanceAdjustment}
                  disabled={
                    balanceModal.processing ||
                    !balanceModal.amount ||
                    isNaN(parseFloat(balanceModal.amount)) ||
                    parseFloat(balanceModal.amount) <= 0
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:opacity-50 ${
                    balanceModal.mode === "add"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-amber-600 hover:bg-amber-500"
                  }`}
                >
                  {balanceModal.processing ? (
                    "Processing..."
                  ) : (
                    <>
                      {balanceModal.mode === "add" ? (
                        <Plus className="h-4 w-4" />
                      ) : (
                        <Minus className="h-4 w-4" />
                      )}
                      {balanceModal.mode === "add"
                        ? "Add Money"
                        : "Remove Money"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
