import { useEffect, useState } from "react";
import "./App.css";



const money = (amount) =>
  new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  }).format(amount);

const API_URL = "http://localhost:5000/api";

function App() {
  const [page, setPage] = useState("Dashboard");
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [debts, setDebts] = useState([]);
  const [debtsLoading, setDebtsLoading] = useState(true);
  const [editingDebt, setEditingDebt] = useState(null);
  const [payments, setPayments] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");

  const outstanding = debts.reduce((sum, debt) => sum + debt.amount - debt.paid, 0);
  const collected = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const unpaidCount = debts.filter((debt) => debt.amount > debt.paid).length;

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
      const response = await fetch(`${API_URL}/customers`);
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
    loadCustomers();
    loadDebts();
    loadPayments();
  }, []);

  
async function loadPayments() {
  try {
    const response = await fetch(`${API_URL}/payments`);
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to load payments.");
    }

    setPayments(
      result.data.map((payment) => ({
        id: payment.payment_id,
        debtId: payment.debt_id,
        customer: `${payment.first_name} ${payment.last_name}`,
        description: payment.description,
        amount: Number(payment.amount),
        date: String(payment.payment_date).slice(0, 10),
        notes: payment.notes,
      }))
    );
  } catch (error) {
    console.error("Error loading payments:", error);
    notify("Failed to load payment history.");
  }
}

  
  // Load saved debts from PostgreSQL through Express.
  async function loadDebts() {
    try {
      const response = await fetch(`${API_URL}/debts`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to load debts.");
      }

      const formattedDebts = result.data.map((debt) => ({
        id: debt.debt_id,
        customerId: debt.customer_id,
        customer: `${debt.first_name} ${debt.last_name}`,
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
        },
        body: JSON.stringify(customerData),
      }
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
          customer.id === formattedCustomer.id
            ? formattedCustomer
            : customer
        )
      );
    } else {
      setCustomers((current) => [
        formattedCustomer,
        ...current,
      ]);
    }

    setEditingCustomer(null);
    formElement.reset();

    notify(
      isEditing
        ? "Customer updated successfully."
        : "Customer registered successfully."
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
      isEditing
        ? `${API_URL}/debts/${editingDebt.id}`
        : `${API_URL}/debts`,
      {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer_id: customerId,
          amount,
          description,
          debt_date: date,
          due_date: due || null,
        }),
      }
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
        : "Debt saved successfully to PostgreSQL."
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
    `Are you sure you want to delete the debt record for ${debt.customer}?\n\nDescription: ${debt.description}\nAmount: ${money(debt.amount)}\n\nThis action cannot be undone.`
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/debts/${debt.id}`, {
      method: "DELETE",
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


  
async function addPayment(event) {
  event.preventDefault();

  const formElement = event.currentTarget;
  const form = new FormData(formElement);

  const debtId = Number(form.get("debtId"));
  const amount = Number(form.get("amount"));
  const paymentDate = form.get("date");

  const debt = debts.find((item) => item.id === debtId);

  if (
    !debt ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > debt.amount - debt.paid
  ) {
    notify("Enter a valid payment not exceeding the remaining balance.");
    return;
  }

  try {
    const response = await fetch(`${API_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        debt_id: debtId,
        amount,
        payment_date: paymentDate,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.message || "Failed to record payment.");
    }

    await Promise.all([loadDebts(), loadPayments()]);

    formElement.reset();
    notify("Payment saved successfully to PostgreSQL.");
  } catch (error) {
    notify(`Could not record payment: ${error.message}`);
  }
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
            Customer API connected
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
                <h2>{editingCustomer ? "Edit customer" : "Register a customer"}</h2>
                  <form className="form-grid" onSubmit={addCustomer}>
                    <Field
                      label="First name"
                      name="firstName"
                      required
                      placeholder="e.g. Juan"
                      defaultValue={editingCustomer?.firstName || ""}
                    />
                    <Field
                      label="Last name"
                      name="lastName"
                      required
                      placeholder="e.g. Dela Cruz"
                      defaultValue={editingCustomer?.lastName || ""}
                    />
                    <Field
                      label="Contact number"
                      name="phone"
                      placeholder="09XXXXXXXXX"
                      defaultValue={editingCustomer?.phone || ""}
                    />
                    <Field
                      label="Address"
                      name="address"
                      placeholder="City or barangay"
                      defaultValue={editingCustomer?.address || ""}
                    />
                    <button className="primary-button form-submit" type="submit">
                      {editingCustomer ? "Save changes" : "＋ Add customer"}
                    </button>
                  </form>
              </section>

              <section className="panel">
                <PanelSearch title="Customer list" count={filteredCustomers.length} search={search} setSearch={setSearch} />
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
                          <td colSpan={4} className="empty-state">Loading customers...</td>
                        </tr>
                      ) : (
                        <>
                          {filteredCustomers.map((customer) => (
                            <tr key={customer.id}>
                              <td><strong>{customer.name}</strong></td>
                              <td>{customer.phone || "—"}</td>
                              <td>{customer.address || "—"}</td>
                              <td>
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => startEditingCustomer(customer)}
                                >
                                  Edit
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filteredCustomers.length === 0 && <EmptyRow columns={4} />}
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
              <PageIntro title="Debt records" subtitle="Create and monitor debts linked to registered customers." />
              
              <section className="panel form-panel">
                <h2>{editingDebt ? "Edit debt record" : "Add a debt record"}</h2>

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
                      <option value="" disabled>Select a customer</option>
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
                      editingDebt?.date || new Date().toLocaleDateString("en-CA")
                    }
                  />

                  <Field
                    label="Due date"
                    name="due"
                    type="date"
                    defaultValue={editingDebt?.due || ""}
                  />

                  <button className="primary-button form-submit" type="submit">
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


              <section className="panel">
                <PanelSearch title="All debt records" count={filteredDebts.length} search={search} setSearch={setSearch} />
                <DebtTable
                  debts={filteredDebts}
                  onEdit={startEditingDebt}
                  onDelete={deleteDebt}
                />
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
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Description</th>
                        <th>Payment date</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
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

          <footer className="footer">UtangTrack · Utang Tracking System · React interface</footer>
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



function DebtTable({ debts, onEdit, onDelete }) {
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
              <td><strong>{debt.customer}</strong></td>
              <td>{debt.description}</td>
              <td>{money(debt.amount)}</td>
              <td>
                <strong>{money(debt.amount - debt.paid)}</strong>
              </td>
              <td>{debt.due || "—"}</td>
              <td>
                <span
                  className={`status status-${debt.status.toLowerCase().replaceAll(" ", "-")}`}
                >
                  {debt.status}
                </span>
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
                  )}

                  {" "}

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

          {debts.length === 0 && (
            <EmptyRow columns={showActions ? 7 : 6} />
          )}
        </tbody>
      </table>
    </div>
  );
}



function EmptyRow({ columns }) {
  return <tr><td colSpan={columns} className="empty-state">No records found.</td></tr>;
}

export default App;
