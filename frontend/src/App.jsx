import { useEffect, useState } from "react";
import "./App.css";

const money = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

const API_URL = "http://localhost:5000/api";

function App() {
  const [token, setToken] = useState(
    () => localStorage.getItem("utangtrack_token") || "",
  );

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("utangtrack_user")) || null;
    } catch {
      return null;
    }
  });
  const [loginError, setLoginError] = useState("");
  const [page, setPage] = useState("Dashboard");

  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [debts, setDebts] = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [editingDebt, setEditingDebt] = useState(null);
  const [payments, setPayments] = useState([]);
  const [editingPayment, setEditingPayment] = useState(null);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const invalidReportDateRange =
    reportStartDate && reportEndDate && reportStartDate > reportEndDate;
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");

    const username = e.target.username.value;
    const password = e.target.password.value;

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoginError(data.message || "Login failed.");
        return;
      }

      const loggedInUser = {
        userId: data.user.userId,
        username: data.user.username,
        role: data.user.role,
        customerId: data.user.customerId,
      };

      localStorage.setItem("utangtrack_token", data.token);
      localStorage.setItem("utangtrack_user", JSON.stringify(loggedInUser));

      setToken(data.token);
      setUser(loggedInUser);
      setPage("Dashboard");
    } catch (error) {
      setLoginError(
        "Cannot connect to the server. Make sure the backend is running.",
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("utangtrack_token");
    localStorage.removeItem("utangtrack_user");

    setToken("");
    setUser(null);
    setPage("Dashboard");

    setCustomers([]);
    setDebts([]);
    setPayments([]);
    setEditingCustomer(null);
    setEditingDebt(null);
    setEditingPayment(null);
    setLoginError("");
    setMessage("");
  };

  const filteredReportDebts = debts.filter((debt) => {
    if (reportStartDate && debt.date < reportStartDate) return false;
    if (reportEndDate && debt.date > reportEndDate) return false;
    return true;
  });

  const outstanding = debts.reduce(
    (sum, debt) => sum + debt.amount - debt.paid,
    0,
  );

  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const unpaidCount = debts.filter((debt) => debt.amount > debt.paid).length;

  // Find debts that are overdue and still have an unpaid balance.
  const today = new Date().toLocaleDateString("en-CA");
  const reportAsOfDate = reportEndDate || today;

  const filteredReportPayments = payments.filter((payment) => {
    if (reportStartDate && payment.date < reportStartDate) return false;
    if (reportEndDate && payment.date > reportEndDate) return false;
    return true;
  });

  const reportTotalDebt = filteredReportDebts.reduce(
    (sum, debt) => sum + debt.amount,
    0,
  );

  const reportPaymentsCollected = filteredReportPayments.reduce(
    (sum, payment) => sum + payment.amount,
    0,
  );

  const reportPaymentCount = filteredReportPayments.length;

  const reportOutstandingBalance = filteredReportDebts.reduce(
    (sum, debt) => sum + Math.max(0, debt.amount - debt.paid),
    0,
  );

  const reportOverdueBalance = filteredReportDebts.reduce((sum, debt) => {
    const isOverdue =
      debt.due && debt.due < reportAsOfDate && debt.amount > debt.paid;

    return sum + (isOverdue ? debt.amount - debt.paid : 0);
  }, 0);

  const reportOverdueCount = filteredReportDebts.filter(
    (debt) => debt.due && debt.due < reportAsOfDate && debt.amount > debt.paid,
  ).length;

  const overdueDebts = debts.filter(
    (debt) => debt.due && debt.due < today && debt.amount > debt.paid,
  );

  // Count overdue debt records.
  const overdueCount = overdueDebts.length;

  // Calculate the total remaining balance of overdue debts.
  const overdueBalance = overdueDebts.reduce(
    (sum, debt) => sum + (debt.amount - debt.paid),
    0,
  );

  function notify(text) {
    setMessage(text);

    window.clearTimeout(window.toastTimer);

    window.toastTimer = window.setTimeout(() => {
      setMessage("");
    }, 3000);
  }

  // Load customers from the PostgreSQL database through Express.
  async function loadCustomers() {
    try {
      const response = await fetch(`${API_URL}/customers`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load customers.");
      }

      const formattedCustomers = result.data.map((customer) => ({
        id: customer.customer_id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        name: `${customer.first_name} ${customer.last_name}`,
        phone: customer.contact_number || "",
        address: customer.address || "",
      }));

      setCustomers(formattedCustomers);
    } catch (error) {
      notify(`Could not load customers: ${error.message}`);
    } finally {
      setCustomersLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !user) return;

    if (user.role === "customer") {
      loadDebts();
      loadPayments();
    } else {
      loadCustomers();
      loadDebts();
      loadPayments();
    }
  }, [token, user]);

  useEffect(() => {
    if (
      user?.role === "customer" &&
      !["Dashboard", "Debt Records", "Payments"].includes(page)
    ) {
      setPage("Dashboard");
    }
  }, [user, page]);

  async function loadPayments() {
    if (!token || !user) return;

    try {
      const endpoint =
        user.role === "customer"
          ? `${API_URL}/customer/my-payments`
          : `${API_URL}/payments`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load payment history.");
      }

      const formattedPayments = result.data.map((payment) => ({
        id: payment.payment_id,
        debtId: payment.debt_id,
        customer:
          user.role === "customer"
            ? user.username
            : `${payment.first_name} ${payment.last_name}`,
        description: payment.description,
        amount: Number(payment.amount),
        date: String(payment.payment_date).slice(0, 10),
        notes: payment.notes,
      }));

      setPayments(formattedPayments);
    } catch (error) {
      console.error("Failed to load payments:", error);
      notify(`Failed to load payment history: ${error.message}`);
    }
  }

  // Load saved debts from PostgreSQL through Express.

  async function loadDebts() {
    if (!token || !user) return;

    try {
      const endpoint =
        user.role === "customer"
          ? `${API_URL}/customer/my-debts`
          : `${API_URL}/debts`;

      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load debts.");
      }

      const formattedDebts = result.data.map((debt) => ({
        id: debt.debt_id,
        customerId: debt.customer_id,
        customer:
          user.role === "customer"
            ? user.username
            : `${debt.first_name} ${debt.last_name}`,
        amount: Number(debt.amount),
        description: debt.description,
        date: debt.debt_date?.slice(0, 10) || "",
        due: debt.due_date?.slice(0, 10) || "",
        status: debt.status,
        paid: Number(debt.total_paid),
      }));

      setDebts(formattedDebts);
    } catch (error) {
      notify(`Could not load debts: ${error.message}`);
    } finally {
      setDebtsLoading(false);
    }
  }

  // Save a new customer to PostgreSQL.

  async function addCustomer(event) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const customerData = {
      first_name: form.get("firstName").trim(),
      last_name: form.get("lastName").trim(),
      contact_number: form.get("phone").trim(),
      address: form.get("address").trim(),
    };

    const isEditing = editingCustomer !== null;

    try {
      const response = await fetch(
        isEditing
          ? `${API_URL}/customers/${editingCustomer.id}`
          : `${API_URL}/customers`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(customerData),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to save customer.");
      }

      const savedCustomer = result.data;

      const formattedCustomer = {
        id: savedCustomer.customer_id,
        firstName: savedCustomer.first_name,
        lastName: savedCustomer.last_name,
        name: `${savedCustomer.first_name} ${savedCustomer.last_name}`,
        phone: savedCustomer.contact_number || "",
        address: savedCustomer.address || "",
      };

      if (isEditing) {
        setCustomers((current) =>
          current.map((customer) =>
            customer.id === formattedCustomer.id ? formattedCustomer : customer,
          ),
        );
      } else {
        setCustomers((current) => [formattedCustomer, ...current]);
      }

      setEditingCustomer(null);
      formElement.reset();

      notify(
        isEditing
          ? "Customer updated successfully."
          : "Customer registered successfully.",
      );
    } catch (error) {
      notify(`Could not save customer: ${error.message}`);
    }
  }

  function startEditingCustomer(customer) {
    setEditingCustomer(customer);
    setPage("Customers");
    setSearch("");
    setMessage("");
  }

  async function deleteCustomer(customer) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${customer.name}?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/customers/${customer.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete customer.");
      }

      await loadCustomers();

      if (editingCustomer?.id === customer.id) {
        setEditingCustomer(null);
      }

      notify("Customer deleted successfully.");
    } catch (error) {
      console.error("Delete customer error:", error);
      notify(error.message || "Failed to delete customer.");
    }
  }

  async function addDebt(event) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const customerId = Number(form.get("customerId"));
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      notify("Please select a customer.");
      return;
    }

    const amount = Number(form.get("amount"));
    const description = form.get("description").trim();
    const date = form.get("date");
    const due = form.get("due") || "";

    if (!Number.isFinite(amount) || amount <= 0 || !description || !date) {
      notify("Please enter a valid amount, description, and debt date.");
      return;
    }

    const isEditing = editingDebt !== null;

    try {
      const response = await fetch(
        isEditing ? `${API_URL}/debts/${editingDebt.id}` : `${API_URL}/debts`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            customer_id: customerId,
            amount,
            description,
            debt_date: date,
            due_date: due || null,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to save debt.");
      }

      await Promise.all([loadDebts(), loadPayments()]);

      setEditingDebt(null);
      formElement.reset();

      notify(
        isEditing
          ? "Debt updated successfully."
          : "Debt saved successfully to PostgreSQL.",
      );
    } catch (error) {
      notify(`Could not save debt: ${error.message}`);
    }
  }

  function startEditingDebt(debt) {
    setEditingDebt(debt);
    setPage("Debt Records");
    setSearch("");
    setMessage("");
  }

  async function deleteDebt(debt) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the debt record for ${debt.customer}?\n\nDescription: ${debt.description}\nAmount: ${money(debt.amount)}\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/debts/${debt.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete debt.");
      }

      await Promise.all([loadDebts(), loadPayments()]);

      if (editingDebt?.id === debt.id) {
        setEditingDebt(null);
      }

      notify("Debt deleted successfully.");
    } catch (error) {
      console.error("Delete debt error:", error);
      notify(error.message || "Failed to delete debt.");
    }
  }

  function startEditingPayment(payment) {
    setEditingPayment(payment);
    setPage("Payments");
    setSearch("");
    setMessage("");
  }

  async function deletePayment(payment) {
    const confirmed = window.confirm(
      `Are you sure you want to delete this payment?\n\nCustomer: ${payment.customer}\nDescription: ${payment.description}\nAmount: ${money(payment.amount)}\n\nThis action cannot be undone.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/payments/${payment.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to delete payment.");
      }

      await Promise.all([loadDebts(), loadPayments()]);

      if (editingPayment?.id === payment.id) {
        setEditingPayment(null);
      }

      notify("Payment deleted successfully.");
    } catch (error) {
      console.error("Delete payment error:", error);
      notify(error.message || "Failed to delete payment.");
    }
  }

  async function addPayment(event) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const isEditing = editingPayment !== null;
    const debtId = isEditing
      ? editingPayment.debtId
      : Number(form.get("debtId"));

    const amount = Number(form.get("amount"));
    const paymentDate = form.get("date");
    const notes = (form.get("notes") || "").trim();

    const debt = debts.find((item) => item.id === debtId);

    if (!debt) {
      notify("The selected debt record could not be found.");
      return;
    }

    const availableBalance = isEditing
      ? debt.amount - debt.paid + editingPayment.amount
      : debt.amount - debt.paid;

    if (!Number.isFinite(amount) || amount <= 0 || amount > availableBalance) {
      notify("Enter a valid payment not exceeding the remaining balance.");
      return;
    }

    try {
      const response = await fetch(
        isEditing
          ? `${API_URL}/payments/${editingPayment.id}`
          : `${API_URL}/payments`,
        {
          method: isEditing ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...(isEditing ? {} : { debt_id: debtId }),
            amount,
            payment_date: paymentDate,
            notes,
          }),
        },
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            (isEditing
              ? "Failed to update payment."
              : "Failed to record payment."),
        );
      }

      await Promise.all([loadDebts(), loadPayments()]);

      formElement.reset();
      setEditingPayment(null);

      notify(
        isEditing
          ? "Payment updated successfully."
          : "Payment saved successfully to PostgreSQL.",
      );
    } catch (error) {
      notify(
        `Could not ${isEditing ? "update" : "record"} payment: ${error.message}`,
      );
    }
  }

  const filteredCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.address}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const filteredDebts = debts.filter((debt) =>
    `${debt.customer} ${debt.description} ${debt.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  const filteredPayments = payments.filter((payment) =>
    `${payment.customer} ${payment.description}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );

  function exportCSV(filename, headers, rows) {
    const escapeCSV = (value) => {
      const text = String(value ?? "");
      return `"${text.replace(/"/g, '""')}"`;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  }

  const navItems =
    user?.role === "customer"
      ? [
          { name: "Dashboard", icon: "⌂" },
          { name: "Debt Records", icon: "▤" },
          { name: "Payments", icon: "₱" },
        ]
      : [
          { name: "Dashboard", icon: "⌂" },
          { name: "Customers", icon: "♙" },
          { name: "Debt Records", icon: "▤" },
          { name: "Payments", icon: "₱" },
          { name: "Reports", icon: "▥" },
        ];

  if (!token || !user) {
    return (
      <div className="login-container">
        <form className="login-form" onSubmit={handleLogin}>
          <h1>UtangTrack</h1>
          <p>Sign in to your account</p>

          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            placeholder="Enter your username"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Enter your password"
            required
          />

          {loginError && <p className="login-error">{loginError}</p>}

          <button type="submit">Log In</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">₱</div>
          <div>
            <h2>UtangTrack</h2>
            <span>Debt Management System</span>
          </div>
        </div>

        <p className="nav-heading">WORKSPACE</p>
        <nav>
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => {
                setPage(item.name);
                setSearch("");
                setMessage("");
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">
            {(user.username || "U").charAt(0).toUpperCase()}
          </div>

          <div>
            <strong>
              {user.role === "admin"
                ? "Administrator"
                : user.role === "staff"
                  ? "Staff"
                  : user.role === "customer"
                    ? "Customer"
                    : user.username}
            </strong>

            <span>@{user.username}</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">UTANG TRACKING SYSTEM</span>
            <h1>{page}</h1>
          </div>
          <div className="header-actions">
            <div className="demo-badge">
              <span className="status-dot" />
              API connected
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={handleLogout}
            >
              Log out
            </button>
          </div>
        </header>

        <div className="content">
          {message && <div className="toast">{message}</div>}

          {page === "Dashboard" && (
            <>
              <section className="welcome">
                <div>
                  <p className="welcome-label">
                    {user?.role === "customer"
                      ? "YOUR ACCOUNT OVERVIEW"
                      : "YOUR FINANCIAL OVERVIEW"}
                  </p>
                  <h2>
                    {user?.role === "customer"
                      ? `Welcome, ${user.username}.`
                      : "Manage debts with confidence."}
                  </h2>
                  <p>
                    {user?.role === "customer"
                      ? "Review your outstanding balance and payment history."
                      : "Track customer balances, repayments, and due dates in one place."}
                  </p>
                </div>
                <div className="welcome-symbol">₱</div>
              </section>

              {user?.role === "customer" ? (
                <>
                  <section className="stats-grid">
                    <StatCard
                      label="My Total Debt"
                      value={money(debts.reduce((s, d) => s + d.amount, 0))}
                      icon="▤"
                    />
                    <StatCard
                      label="My Outstanding Balance"
                      value={money(
                        debts.reduce(
                          (s, d) => s + Math.max(0, d.amount - d.paid),
                          0,
                        ),
                      )}
                      icon="◷"
                    />
                    <StatCard
                      label="My Payments"
                      value={money(
                        payments.reduce((s, payment) => s + payment.amount, 0),
                      )}
                      icon="✓"
                    />
                    <StatCard
                      label="My Unsettled Debts"
                      value={debts.filter((d) => d.status !== "Paid").length}
                      icon="!"
                    />
                  </section>

                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>My recent debts</h2>
                        <p>Your latest recorded debt entries</p>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => setPage("Debt Records")}
                      >
                        View all →
                      </button>
                    </div>
                    <DebtTable debts={debts.slice(0, 5)} today={today} />
                  </section>

                  <section className="quick-actions">
                    <button onClick={() => setPage("Debt Records")}>
                      View my debts
                    </button>
                    <button onClick={() => setPage("Payments")}>
                      View my payments
                    </button>
                  </section>
                </>
              ) : (
                <>
                  <section className="stats-grid">
                    <StatCard
                      label="Total Debt"
                      value={money(debts.reduce((s, d) => s + d.amount, 0))}
                      icon="▤"
                    />
                    <StatCard
                      label="Outstanding Balance"
                      value={money(outstanding)}
                      icon="◷"
                    />
                    <StatCard
                      label="Payments Collected"
                      value={money(collected)}
                      icon="✓"
                    />
                    <StatCard
                      label="Unsettled Debts"
                      value={unpaidCount}
                      icon="!"
                    />
                    <StatCard
                      label="Overdue Debts"
                      value={overdueCount}
                      icon="!"
                    />
                    <StatCard
                      label="Overdue Balance"
                      value={money(overdueBalance)}
                      icon="◷"
                    />
                  </section>

                  <section className="panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Recent debt records</h2>
                        <p>Your latest recorded debts</p>
                      </div>
                      <button
                        className="secondary-button"
                        onClick={() => setPage("Debt Records")}
                      >
                        View all →
                      </button>
                    </div>
                    <DebtTable debts={debts.slice(0, 5)} today={today} />
                  </section>

                  <section className="quick-actions">
                    <button onClick={() => setPage("Customers")}>
                      ＋ Register a customer
                    </button>
                    <button onClick={() => setPage("Debt Records")}>
                      ＋ Add a debt
                    </button>
                    <button onClick={() => setPage("Payments")}>
                      ＋ Record a payment
                    </button>
                  </section>
                </>
              )}
            </>
          )}

          {page === "Customers" && (
            <>
              <PageIntro
                title="Customer management"
                subtitle="Register customers and manage their contact information."
              />

              <section className="panel form-panel">
                <h2>
                  {editingCustomer ? "Edit customer" : "Register a customer"}
                </h2>
                <form className="form-grid" onSubmit={addCustomer}>
                  <Field
                    label="First name"
                    name="firstName"
                    required
                    placeholder="e.g. Juan"
                    defaultValue={editingCustomer?.firstName || ""}
                    onInput={(event) => {
                      event.target.value = event.target.value.replace(
                        /[^a-zA-ZÀ-ÿ\s'-]/g,
                        "",
                      );
                    }}
                  />
                  <Field
                    label="Last name"
                    name="lastName"
                    required
                    placeholder="e.g. Dela Cruz"
                    defaultValue={editingCustomer?.lastName || ""}
                    onInput={(event) => {
                      event.target.value = event.target.value.replace(
                        /[^a-zA-ZÀ-ÿ\s'-]/g,
                        "",
                      );
                    }}
                  />
                  <Field
                    label="Contact number"
                    name="phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={11}
                    placeholder="09XXXXXXXXX"
                    defaultValue={editingCustomer?.phone || ""}
                    onInput={(event) => {
                      event.target.value = event.target.value.replace(
                        /\D/g,
                        "",
                      );
                    }}
                  />

                  <Field
                    label="Address"
                    name="address"
                    placeholder="e.g. San Roque, Macrohon"
                    defaultValue={editingCustomer?.address || ""}
                    maxLength={150}
                    onInput={(event) => {
                      event.target.value = event.target.value.replace(
                        /[^a-zA-ZÀ-ÿ0-9\s,.'/-]/g,
                        "",
                      );
                    }}
                  />

                  <button className="primary-button form-submit" type="submit">
                    {editingCustomer ? "Save changes" : "＋ Add customer"}
                  </button>
                </form>
              </section>

              <section className="panel">
                <PanelSearch
                  title="Customer list"
                  count={filteredCustomers.length}
                  search={search}
                  setSearch={setSearch}
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Contact Number</th>
                        <th>Address</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customersLoading ? (
                        <tr>
                          <td colSpan={4} className="empty-state">
                            Loading customers...
                          </td>
                        </tr>
                      ) : (
                        <>
                          {filteredCustomers.map((customer) => (
                            <tr key={customer.id}>
                              <td>
                                <strong>{customer.name}</strong>
                              </td>
                              <td>{customer.phone || "—"}</td>
                              <td>{customer.address || "—"}</td>

                              <td>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => startEditingCustomer(customer)}
                                >
                                  Edit
                                </button>{" "}
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => deleteCustomer(customer)}
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredCustomers.length === 0 && (
                            <EmptyRow columns={4} />
                          )}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {page === "Debt Records" && (
            <>
              <PageIntro
                title={
                  user?.role === "customer" ? "My debt records" : "Debt records"
                }
                subtitle={
                  user?.role === "customer"
                    ? "Review your recorded debts, outstanding balances, and due dates."
                    : "Create and monitor debts linked to registered customers."
                }
              />

              {user?.role !== "customer" && (
                <section className="panel form-panel">
                  <h2>
                    {editingDebt ? "Edit debt record" : "Add a debt record"}
                  </h2>

                  <form
                    key={editingDebt?.id ?? "new"}
                    className="form-grid"
                    onSubmit={addDebt}
                  >
                    <label className="field">
                      <span>Customer *</span>
                      <select
                        name="customerId"
                        required
                        defaultValue={editingDebt?.customerId ?? ""}
                      >
                        <option value="" disabled>
                          Select a customer
                        </option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>
                            {customer.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <Field
                      label="Amount (₱)"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      defaultValue={editingDebt?.amount ?? ""}
                    />

                    <Field
                      label="Description"
                      name="description"
                      required
                      placeholder="Reason for the debt"
                      defaultValue={editingDebt?.description ?? ""}
                    />

                    <Field
                      label="Debt date"
                      name="date"
                      type="date"
                      required
                      defaultValue={
                        editingDebt?.date ||
                        new Date().toLocaleDateString("en-CA")
                      }
                    />

                    <Field
                      label="Due date"
                      name="due"
                      type="date"
                      defaultValue={editingDebt?.due || ""}
                    />

                    <button
                      className="primary-button form-submit"
                      type="submit"
                    >
                      {editingDebt ? "Save changes" : "＋ Add debt"}
                    </button>

                    {editingDebt && (
                      <button
                        className="secondary-button form-submit"
                        type="button"
                        onClick={() => setEditingDebt(null)}
                      >
                        Cancel editing
                      </button>
                    )}
                  </form>
                </section>
              )}

              <section className="panel">
                <PanelSearch
                  title={
                    user?.role === "customer"
                      ? "My debt records"
                      : "All debt records"
                  }
                  count={filteredDebts.length}
                  search={search}
                  setSearch={setSearch}
                />

                {user?.role === "customer" ? (
                  <DebtTable debts={filteredDebts} today={today} />
                ) : (
                  <DebtTable
                    debts={filteredDebts}
                    onEdit={startEditingDebt}
                    onDelete={deleteDebt}
                    today={today}
                  />
                )}
              </section>
            </>
          )}

          {page === "Payments" && (
            <>
              <PageIntro
                title={
                  user.role === "customer"
                    ? "My payment history"
                    : "Payment management"
                }
                subtitle={
                  user.role === "customer"
                    ? "Review the payments recorded for your debts."
                    : "Record repayments and review the payment history."
                }
              />

              <section className="stats-grid payment-stats">
                <StatCard
                  label={
                    user.role === "customer" ? "My Payments" : "Total Collected"
                  }
                  value={money(
                    payments.reduce((sum, payment) => sum + payment.amount, 0),
                  )}
                  icon="₱"
                />
                <StatCard
                  label="Transactions"
                  value={payments.length}
                  icon="▤"
                />
                <StatCard
                  label={
                    user.role === "customer"
                      ? "My Remaining Balance"
                      : "Remaining Balance"
                  }
                  value={money(
                    user.role === "customer"
                      ? debts.reduce(
                          (sum, debt) =>
                            sum + Math.max(0, debt.amount - debt.paid),
                          0,
                        )
                      : outstanding,
                  )}
                  icon="◷"
                />
              </section>

              {(user.role === "admin" || user.role === "staff") && (
                <section className="panel form-panel">
                  <h2>
                    {editingPayment ? "Edit payment" : "Record a payment"}
                  </h2>
                  <form
                    key={editingPayment?.id ?? "new"}
                    className="form-grid"
                    onSubmit={addPayment}
                  >
                    {!editingPayment && (
                      <label className="field">
                        <span>Debt record *</span>
                        <select name="debtId" required defaultValue="">
                          <option value="" disabled>
                            Select a debt
                          </option>
                          {debts
                            .filter((debt) => debt.paid < debt.amount)
                            .map((debt) => (
                              <option key={debt.id} value={debt.id}>
                                {debt.customer} —{" "}
                                {money(debt.amount - debt.paid)} remaining
                              </option>
                            ))}
                        </select>
                      </label>
                    )}

                    <Field
                      label="Payment amount (₱)"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                      placeholder="0.00"
                      defaultValue={editingPayment?.amount ?? ""}
                    />

                    <Field
                      label="Payment date"
                      name="date"
                      type="date"
                      required
                      defaultValue={
                        editingPayment?.date ||
                        new Date().toLocaleDateString("en-CA")
                      }
                    />

                    <Field
                      label="Notes (optional)"
                      name="notes"
                      placeholder="e.g. Partial payment for school expenses"
                      defaultValue={editingPayment?.notes ?? ""}
                    />

                    <button
                      className="primary-button form-submit"
                      type="submit"
                    >
                      {editingPayment ? "Save changes" : "✓ Record payment"}
                    </button>

                    {editingPayment && (
                      <button
                        className="secondary-button form-submit"
                        type="button"
                        onClick={() => setEditingPayment(null)}
                      >
                        Cancel editing
                      </button>
                    )}
                  </form>
                </section>
              )}

              <section className="panel">
                <PanelSearch
                  title={
                    user.role === "customer"
                      ? "My payment history"
                      : "Payment history"
                  }
                  count={filteredPayments.length}
                  search={search}
                  setSearch={setSearch}
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>
                          {user.role === "customer" ? "Account" : "Customer"}
                        </th>
                        <th>Description</th>
                        <th>Payment date</th>
                        <th>Amount</th>
                        <th>Notes</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td>
                            <strong>{payment.customer}</strong>
                          </td>
                          <td>{payment.description}</td>
                          <td>{payment.date || "—"}</td>
                          <td className="amount-positive">
                            {money(payment.amount)}
                          </td>
                          <td>{payment.notes || "—"}</td>
                          <td>
                            {user.role === "admin" && (
                              <>
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => startEditingPayment(payment)}
                                >
                                  Edit
                                </button>{" "}
                                <button
                                  className="secondary-button"
                                  type="button"
                                  onClick={() => deletePayment(payment)}
                                >
                                  Delete
                                </button>
                              </>
                            )}
                            {user.role !== "admin" && <span>View only</span>}
                          </td>
                        </tr>
                      ))}
                      {filteredPayments.length === 0 && (
                        <EmptyRow columns={6} />
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {page === "Reports" && (
            <div className="page-content">
              <PageIntro
                eyebrow="UTANG TRACKING SYSTEM"
                title="Reports"
                description="Review debt records, collected payments, and outstanding balances."
              />

              <div className="panel">
                <div className="form-grid">
                  <Field
                    label="Start date"
                    name="reportStartDate"
                    type="date"
                    value={reportStartDate}
                    onChange={(event) => setReportStartDate(event.target.value)}
                  />

                  <Field
                    label="End date"
                    name="reportEndDate"
                    type="date"
                    value={reportEndDate}
                    onChange={(event) => setReportEndDate(event.target.value)}
                  />

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setReportStartDate("");
                      setReportEndDate("");
                    }}
                  >
                    Clear dates
                  </button>
                  {invalidReportDateRange && (
                    <p className="form-error">
                      Start date cannot be later than end date.
                    </p>
                  )}
                </div>

                <div className="panel report-actions">
                  <button
                    type="button"
                    disabled={invalidReportDateRange}
                    className="primary-button"
                    onClick={() => window.print()}
                  >
                    Print Report / Save as PDF
                  </button>

                  <button
                    type="button"
                    disabled={invalidReportDateRange}
                    className="secondary-button"
                    onClick={() =>
                      exportCSV(
                        "utangtrack-debt-report.csv",
                        [
                          "Customer",
                          "Description",
                          "Debt Date",
                          "Due Date",
                          "Debt Amount",
                          "Amount Paid",
                          "Outstanding Balance",
                          "Status",
                        ],
                        filteredReportDebts.map((debt) => [
                          debt.customer,
                          debt.description,
                          debt.date,
                          debt.due,
                          debt.amount.toFixed(2),
                          debt.paid.toFixed(2),
                          Math.max(0, debt.amount - debt.paid).toFixed(2),
                          debt.amount > debt.paid &&
                          debt.due &&
                          debt.due < today
                            ? "Overdue"
                            : debt.status,
                        ]),
                      )
                    }
                  >
                    Export Debt Report (CSV)
                  </button>

                  <button
                    type="button"
                    disabled={invalidReportDateRange}
                    className="secondary-button"
                    onClick={() =>
                      exportCSV(
                        "utangtrack-payment-report.csv",
                        [
                          "Customer",
                          "Description",
                          "Payment Date",
                          "Amount",
                          "Notes",
                        ],
                        filteredReportPayments.map((payment) => [
                          payment.customer,
                          payment.description,
                          payment.date,
                          payment.amount.toFixed(2),
                          payment.notes || "",
                        ]),
                      )
                    }
                  >
                    Export Payment Report (CSV)
                  </button>
                </div>
              </div>

              <div className="stats-grid">
                <StatCard
                  label="Total Debt"
                  value={money(reportTotalDebt)}
                  detail="Debts created in selected period"
                  icon="▤"
                />

                <StatCard
                  label="Payments Collected"
                  value={money(reportPaymentsCollected)}
                  detail="Payments received in selected period"
                  icon="✓"
                />

                <StatCard
                  label="Payment Transactions"
                  value={reportPaymentCount}
                  icon="▤"
                />

                <StatCard
                  label="Outstanding Balance"
                  value={money(reportOutstandingBalance)}
                  detail="Current balance of filtered debts"
                  icon="◷"
                />

                <StatCard
                  label="Overdue Balance"
                  value={money(reportOverdueBalance)}
                  detail="Overdue balance of filtered debts"
                  icon="!"
                />

                <StatCard
                  label="Overdue Debt Records"
                  value={reportOverdueCount}
                  detail="Overdue debts in the selected period"
                  icon="!"
                />
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Debt Report</h2>
                    <p>Overview of all recorded debt accounts.</p>
                  </div>
                </div>

                <DebtTable debts={filteredReportDebts} today={reportAsOfDate} />
              </div>
            </div>
          )}

          <footer className="footer">
            UtangTrack · Utang Tracking System · React interface
          </footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon, detail }) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong className="stat-value">{value}</strong>
      {detail && <p className="stat-detail">{detail}</p>}
    </div>
  );
}

function PageIntro({ title, subtitle }) {
  return (
    <div className="page-intro">
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function Field({ label, name, type = "text", ...props }) {
  return (
    <label className="field">
      <span>
        {label}
        {props.required ? " *" : ""}
      </span>
      <input name={name} type={type} {...props} />
    </label>
  );
}

function PanelSearch({ title, count, search, setSearch }) {
  return (
    <div className="panel-heading panel-search-heading">
      <div>
        <h2>{title}</h2>
        <p>
          {count} record{count === 1 ? "" : "s"}
        </p>
      </div>
      <input
        className="search-input"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search records..."
        aria-label={`Search ${title}`}
      />
    </div>
  );
}

function DebtTable({ debts, onEdit, onDelete, today }) {
  const showActions = onEdit || onDelete;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Description</th>
            <th>Debt amount</th>
            <th>Balance</th>
            <th>Due date</th>
            <th>Status</th>
            {showActions && <th>Actions</th>}
          </tr>
        </thead>

        <tbody>
          {debts.map((debt) => (
            <tr key={debt.id}>
              <td>
                <strong>{debt.customer}</strong>
              </td>
              <td>{debt.description}</td>
              <td>{money(debt.amount)}</td>
              <td>
                <strong>{money(debt.amount - debt.paid)}</strong>
              </td>
              <td>{debt.due || "—"}</td>

              <td>
                {debt.amount > debt.paid && debt.due && debt.due < today ? (
                  <span className="status status-overdue">Overdue</span>
                ) : (
                  <span
                    className={`status status-${debt.status.toLowerCase().replaceAll(" ", "-")}`}
                  >
                    {debt.status}
                  </span>
                )}
              </td>

              {showActions && (
                <td>
                  {onEdit && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onEdit(debt)}
                    >
                      Edit
                    </button>
                  )}{" "}
                  {onDelete && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => onDelete(debt)}
                    >
                      Delete
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}

          {debts.length === 0 && <EmptyRow columns={showActions ? 7 : 6} />}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns }) {
  return (
    <tr>
      <td colSpan={columns} className="empty-state">
        No records found.
      </td>
    </tr>
  );
}

export default App;
