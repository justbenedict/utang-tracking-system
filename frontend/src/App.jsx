import { useState } from "react";
import "./App.css";

const initialCustomers = [
  { id: 1, name: "Juan Dela Cruz", phone: "09171234567", address: "Maasin City" },
  { id: 2, name: "Maria Santos", phone: "09981234567", address: "Macrohon, Southern Leyte" },
];

const initialDebts = [
  { id: 1, customerId: 1, customer: "Juan Dela Cruz", amount: 1500, description: "School expenses", date: "2026-10-14", due: "2026-10-21", status: "Unpaid", paid: 0 },
  { id: 2, customerId: 2, customer: "Maria Santos", amount: 500, description: "Personal loan", date: "2026-10-15", due: "2026-10-25", status: "Partially Paid", paid: 200 },
];

const money = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

function App() {
  const [page, setPage] = useState("Dashboard");
  const [customers, setCustomers] = useState(initialCustomers);
  const [debts, setDebts] = useState(initialDebts);
  const [payments, setPayments] = useState([
    { id: 1, customer: "Maria Santos", description: "Personal loan", amount: 200, date: "2026-10-16" },
  ]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const outstanding = debts.reduce((sum, debt) => sum + debt.amount - debt.paid, 0);
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const unpaidCount = debts.filter((debt) => debt.amount > debt.paid).length;

  function notify(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3000);
  }

  function addCustomer(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const customer = {
      id: Date.now(),
      name: `${form.get("firstName").trim()} ${form.get("lastName").trim()}`,
      phone: form.get("phone").trim(),
      address: form.get("address").trim(),
    };

    setCustomers((current) => [...current, customer]);
    event.currentTarget.reset();
    notify("Customer added to this demo session.");
  }

  function addDebt(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customerId = Number(form.get("customerId"));
    const customer = customers.find((item) => item.id === customerId);

    if (!customer) {
      notify("Please select a customer.");
      return;
    }

    setDebts((current) => [
      {
        id: Date.now(),
        customerId,
        customer: customer.name,
        amount: Number(form.get("amount")),
        description: form.get("description").trim(),
        date: form.get("date"),
        due: form.get("due") || "",
        status: "Unpaid",
        paid: 0,
      },
      ...current,
    ]);

    event.currentTarget.reset();
    notify("Debt added to this demo session.");
  }

  function addPayment(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const debtId = Number(form.get("debtId"));
    const amount = Number(form.get("amount"));
    const debt = debts.find((item) => item.id === debtId);

    if (!debt || amount <= 0 || amount > debt.amount - debt.paid) {
      notify("Enter a valid payment not exceeding the remaining balance.");
      return;
    }

    setDebts((current) =>
      current.map((item) => {
        if (item.id !== debtId) return item;
        const paid = item.paid + amount;
        return {
          ...item,
          paid,
          status: paid >= item.amount ? "Paid" : "Partially Paid",
        };
      })
    );

    setPayments((current) => [
      {
        id: Date.now(),
        customer: debt.customer,
        description: debt.description,
        amount,
        date: form.get("date"),
      },
      ...current,
    ]);

    event.currentTarget.reset();
    notify("Payment recorded in this demo session.");
  }

  const filteredCustomers = customers.filter((customer) =>
    `${customer.name} ${customer.phone} ${customer.address}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const filteredDebts = debts.filter((debt) =>
    `${debt.customer} ${debt.description} ${debt.status}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const filteredPayments = payments.filter((payment) =>
    `${payment.customer} ${payment.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const navItems = [
    { name: "Dashboard", icon: "⌂" },
    { name: "Customers", icon: "♙" },
    { name: "Debt Records", icon: "▤" },
    { name: "Payments", icon: "₱" },
  ];

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
          <div className="avatar">A</div>
          <div>
            <strong>Administrator</strong>
            <span>Local demo account</span>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div>
            <span className="eyebrow">UTANG TRACKING SYSTEM</span>
            <h1>{page}</h1>
          </div>
          <div className="demo-badge">
            <span className="status-dot" />
            Demo mode
          </div>
        </header>

        <div className="content">
          {message && <div className="toast">{message}</div>}

          {page === "Dashboard" && (
            <>
              <section className="welcome">
                <div>
                  <p className="welcome-label">YOUR FINANCIAL OVERVIEW</p>
                  <h2>Manage debts with confidence.</h2>
                  <p>Track customer balances, repayments, and due dates in one place.</p>
                </div>
                <div className="welcome-symbol">₱</div>
              </section>

              <section className="stats-grid">
                <StatCard label="Total Debt" value={money(debts.reduce((s, d) => s + d.amount, 0))} icon="▤" />
                <StatCard label="Outstanding Balance" value={money(outstanding)} icon="◷" />
                <StatCard label="Payments Collected" value={money(collected)} icon="✓" />
                <StatCard label="Unsettled Debts" value={unpaidCount} icon="!" />
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent debt records</h2>
                    <p>Your latest recorded debts</p>
                  </div>
                  <button className="secondary-button" onClick={() => setPage("Debt Records")}>
                    View all →
                  </button>
                </div>
                <DebtTable debts={debts.slice(0, 5)} />
              </section>

              <section className="quick-actions">
                <button onClick={() => setPage("Customers")}>＋ Register a customer</button>
                <button onClick={() => setPage("Debt Records")}>＋ Add a debt</button>
                <button onClick={() => setPage("Payments")}>＋ Record a payment</button>
              </section>
            </>
          )}

          {page === "Customers" && (
            <>
              <PageIntro title="Customer management" subtitle="Register customers and manage their contact information." />
              <section className="panel form-panel">
                <h2>Register a customer</h2>
                <form className="form-grid" onSubmit={addCustomer}>
                  <Field label="First name" name="firstName" required placeholder="e.g. Juan" />
                  <Field label="Last name" name="lastName" required placeholder="e.g. Dela Cruz" />
                  <Field label="Contact number" name="phone" placeholder="09XXXXXXXXX" />
                  <Field label="Address" name="address" placeholder="City or barangay" />
                  <button className="primary-button form-submit" type="submit">＋ Add customer</button>
                </form>
              </section>

              <section className="panel">
                <PanelSearch title="Customer list" count={filteredCustomers.length} search={search} setSearch={setSearch} />
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Customer</th><th>Contact number</th><th>Address</th></tr></thead>
                    <tbody>
                      {filteredCustomers.map((customer) => (
                        <tr key={customer.id}>
                          <td><strong>{customer.name}</strong></td>
                          <td>{customer.phone || "—"}</td>
                          <td>{customer.address || "—"}</td>
                        </tr>
                      ))}
                      {filteredCustomers.length === 0 && <EmptyRow columns={3} />}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {page === "Debt Records" && (
            <>
              <PageIntro title="Debt records" subtitle="Create and monitor debts linked to registered customers." />
              <section className="panel form-panel">
                <h2>Add a debt record</h2>
                <form className="form-grid" onSubmit={addDebt}>
                  <label className="field">
                    <span>Customer *</span>
                    <select name="customerId" required defaultValue="">
                      <option value="" disabled>Select a customer</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </select>
                  </label>
                  <Field label="Amount (₱)" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
                  <Field label="Description" name="description" required placeholder="Reason for the debt" />
                  <Field label="Debt date" name="date" type="date" required defaultValue={new Date().toLocaleDateString("en-CA")} />
                  <Field label="Due date" name="due" type="date" />
                  <button className="primary-button form-submit" type="submit">＋ Add debt</button>
                </form>
              </section>

              <section className="panel">
                <PanelSearch title="All debt records" count={filteredDebts.length} search={search} setSearch={setSearch} />
                <DebtTable debts={filteredDebts} />
              </section>
            </>
          )}

          {page === "Payments" && (
            <>
              <PageIntro title="Payment management" subtitle="Record repayments and review the payment history." />
              <section className="stats-grid payment-stats">
                <StatCard label="Total Collected" value={money(collected)} icon="₱" />
                <StatCard label="Transactions" value={payments.length} icon="▤" />
                <StatCard label="Remaining Balance" value={money(outstanding)} icon="◷" />
              </section>
              <section className="panel form-panel">
                <h2>Record a payment</h2>
                <form className="form-grid" onSubmit={addPayment}>
                  <label className="field">
                    <span>Debt record *</span>
                    <select name="debtId" required defaultValue="">
                      <option value="" disabled>Select a debt</option>
                      {debts.filter((debt) => debt.paid < debt.amount).map((debt) => (
                        <option key={debt.id} value={debt.id}>
                          {debt.customer} — {money(debt.amount - debt.paid)} remaining
                        </option>
                      ))}
                    </select>
                  </label>
                  <Field label="Payment amount (₱)" name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" />
                  <Field label="Payment date" name="date" type="date" required defaultValue={new Date().toLocaleDateString("en-CA")} />
                  <button className="primary-button form-submit" type="submit">✓ Record payment</button>
                </form>
              </section>

              <section className="panel">
                <PanelSearch title="Payment history" count={filteredPayments.length} search={search} setSearch={setSearch} />
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Customer</th><th>Description</th><th>Payment date</th><th>Amount</th></tr></thead>
                    <tbody>
                      {filteredPayments.map((payment) => (
                        <tr key={payment.id}>
                          <td><strong>{payment.customer}</strong></td>
                          <td>{payment.description}</td>
                          <td>{payment.date || "—"}</td>
                          <td className="amount-positive">{money(payment.amount)}</td>
                        </tr>
                      ))}
                      {filteredPayments.length === 0 && <EmptyRow columns={4} />}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <footer className="footer">UtangTrack · Utang Tracking System · React interface prototype</footer>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div>
      <strong className="stat-value">{value}</strong>
    </div>
  );
}

function PageIntro({ title, subtitle }) {
  return <div className="page-intro"><h2>{title}</h2><p>{subtitle}</p></div>;
}

function Field({ label, name, type = "text", ...props }) {
  return (
    <label className="field">
      <span>{label}{props.required ? " *" : ""}</span>
      <input name={name} type={type} {...props} />
    </label>
  );
}

function PanelSearch({ title, count, search, setSearch }) {
  return (
    <div className="panel-heading panel-search-heading">
      <div><h2>{title}</h2><p>{count} record{count === 1 ? "" : "s"}</p></div>
      <input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search records..." aria-label={`Search ${title}`} />
    </div>
  );
}

function DebtTable({ debts }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Customer</th><th>Description</th><th>Debt amount</th><th>Balance</th><th>Due date</th><th>Status</th></tr></thead>
        <tbody>
          {debts.map((debt) => (
            <tr key={debt.id}>
              <td><strong>{debt.customer}</strong></td>
              <td>{debt.description}</td>
              <td>{money(debt.amount)}</td>
              <td><strong>{money(debt.amount - debt.paid)}</strong></td>
              <td>{debt.due || "—"}</td>
              <td><span className={`status status-${debt.status.toLowerCase().replaceAll(" ", "-")}`}>{debt.status}</span></td>
            </tr>
          ))}
          {debts.length === 0 && <EmptyRow columns={6} />}
        </tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns }) {
  return <tr><td colSpan={columns} className="empty-state">No records found.</td></tr>;
}

export default App;