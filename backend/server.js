const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

const isValidName = (value) =>
  typeof value === "string" && /^[a-zA-ZÀ-ÿ\s'-]+$/.test(value.trim());

const isValidContactNumber = (value) =>
  typeof value === "string" && /^[0-9]+$/.test(value);

const isValidAddress = (value) =>
  typeof value === "string" && /^[a-zA-ZÀ-ÿ0-9\s,.'/]*$/.test(value);

// Middleware
app.use(cors());
app.use(express.json());

// Home route
app.get("/", (req, res) => {
  res.send("Utang Tracking System API is running!");
});

/* CUSTOMER CRUD */

// GET: Retrieve all customers
app.get("/api/customers", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT customer_id, first_name, last_name,
             contact_number, address, created_at
      FROM customers
      ORDER BY customer_id DESC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error retrieving customers:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve customers.",
    });
  }
});

// POST: Register a customer
app.post("/api/customers", async (req, res) => {
  try {
    const { first_name, last_name, contact_number, address } = req.body;

    if (
      typeof first_name !== "string" ||
      !first_name.trim() ||
      typeof last_name !== "string" ||
      !last_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required.",
      });
    }

    if (!isValidName(first_name) || !isValidName(last_name)) {
      return res.status(400).json({
        success: false,
        message:
          "Names may contain letters, spaces, apostrophes, and hyphens only.",
      });
    }

    // Validate optional contact number and address
    if (contact_number != null && typeof contact_number !== "string") {
      return res.status(400).json({
        success: false,
        message: "Contact number must be text.",
      });
    }

    if (
      contact_number != null &&
      contact_number.trim() !== "" &&
      !isValidContactNumber(contact_number.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Contact number must contain digits only.",
      });
    }

    if (address != null && typeof address !== "string") {
      return res.status(400).json({
        success: false,
        message: "Address must be text.",
      });
    }

    if (
      address != null &&
      address.trim() !== "" &&
      !isValidAddress(address.trim())
    ) {
      return res.status(400).json({
        success: false,
        message: "Address contains unsupported characters.",
      });
    }

    const result = await pool.query(
      `INSERT INTO customers
        (first_name, last_name, contact_number, address)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        first_name.trim(),
        last_name.trim(),
        contact_number?.trim() || null,
        address?.trim() || null,
      ],
    );

    res.status(201).json({
      success: true,
      message: "Customer registered successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error registering customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to register customer.",
    });
  }
});

// PUT: Update a customer
app.put("/api/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { first_name, last_name, contact_number, address } = req.body;

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    if (
      typeof first_name !== "string" ||
      !first_name.trim() ||
      typeof last_name !== "string" ||
      !last_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required.",
      });
    }

    // Validate optional contact number and address
    if (contact_number != null && typeof contact_number !== "string") {
      return res.status(400).json({
        success: false,
        message: "Contact number must be text.",
      });
    }

    if (address != null && typeof address !== "string") {
      return res.status(400).json({
        success: false,
        message: "Address must be text.",
      });
    }

    const result = await pool.query(
      `UPDATE customers
       SET first_name = $1,
           last_name = $2,
           contact_number = $3,
           address = $4
       WHERE customer_id = $5
       RETURNING *`,
      [
        first_name.trim(),
        last_name.trim(),
        contact_number?.trim() || null,
        address?.trim() || null,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update customer.",
    });
  }
});

// DELETE: Delete a customer
app.delete("/api/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID.",
      });
    }

    const result = await pool.query(
      `DELETE FROM customers
       WHERE customer_id = $1
       RETURNING customer_id`,
      [id],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully.",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message: "This customer has debt records and cannot be deleted.",
      });
    }

    console.error("Error deleting customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete customer.",
    });
  }
});

/* POST: Save a debt record to PostgreSQL */
app.post("/api/debts", async (req, res) => {
  try {
    const { customer_id, amount, description, debt_date, due_date } = req.body;

    const customerId = Number(customer_id);
    const debtAmount = Number(amount);

    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid customer.",
      });
    }

    if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Debt amount must be greater than zero.",
      });
    }

    if (
      typeof description !== "string" ||
      !description.trim() ||
      typeof debt_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(debt_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "A description and valid debt date are required.",
      });
    }

    const debtDate = new Date(`${debt_date}T00:00:00.000Z`);

    if (
      Number.isNaN(debtDate.getTime()) ||
      debtDate.toISOString().slice(0, 10) !== debt_date
    ) {
      return res.status(400).json({
        success: false,
        message: "Debt date is invalid.",
      });
    }

    // Validate optional due date
    if (due_date != null && due_date !== "") {
      if (
        typeof due_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(due_date)
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid due date is required.",
        });
      }

      const dueDate = new Date(`${due_date}T00:00:00.000Z`);

      if (
        Number.isNaN(dueDate.getTime()) ||
        dueDate.toISOString().slice(0, 10) !== due_date
      ) {
        return res.status(400).json({
          success: false,
          message: "Due date is invalid.",
        });
      }
    }

    const result = await pool.query(
      `INSERT INTO debts
        (customer_id, amount, description, debt_date, due_date, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        customerId,
        debtAmount,
        description.trim(),
        debt_date,
        due_date || null,
        "Unpaid",
      ],
    );

    res.status(201).json({
      success: true,
      message: "Debt saved successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error saving debt:", error.message);

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "The selected customer does not exist.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to save debt record.",
    });
  }
});

// GET API: Retrieve debt records from PostgreSQL
app.get("/api/debts", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        debts.debt_id,
        debts.customer_id,
        customers.first_name,
        customers.last_name,
        debts.amount,
        debts.description,
        TO_CHAR(debts.debt_date, 'YYYY-MM-DD') AS debt_date,
        TO_CHAR(debts.due_date, 'YYYY-MM-DD') AS due_date,
        debts.status,
        COALESCE(
          (
            SELECT SUM(payments.amount)
          FROM payments
          WHERE payments.debt_id = debts.debt_id
          ),
          0
        ) AS total_paid
      FROM debts
      INNER JOIN customers
        ON debts.customer_id = customers.customer_id
      ORDER BY debts.debt_id DESC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error retrieving debts:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve debt records.",
    });
  }
});

/* PUT: Update an existing debt */
app.put("/api/debts/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { customer_id, amount, description, debt_date, due_date } = req.body;

    const customerId = Number(customer_id);
    const debtAmount = Number(amount);

    // Validate debt ID
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid debt ID.",
      });
    }

    // Validate customer
    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid customer.",
      });
    }

    // Validate amount
    if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Debt amount must be greater than zero.",
      });
    }

    // Validate description and dates

    // Validate optional due date
    if (due_date != null && due_date !== "") {
      if (
        typeof due_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(due_date)
      ) {
        return res.status(400).json({
          success: false,
          message: "A valid due date is required.",
        });
      }

      const dueDate = new Date(`${due_date}T00:00:00.000Z`);

      if (
        Number.isNaN(dueDate.getTime()) ||
        dueDate.toISOString().slice(0, 10) !== due_date
      ) {
        return res.status(400).json({
          success: false,
          message: "Due date is invalid.",
        });
      }
    }

    // Validate description and debt date format
    if (
      typeof description !== "string" ||
      !description.trim() ||
      typeof debt_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(debt_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "A description and valid debt date are required.",
      });
    }

    // Validate that the debt date exists on the calendar
    const debtDate = new Date(`${debt_date}T00:00:00.000Z`);

    if (
      Number.isNaN(debtDate.getTime()) ||
      debtDate.toISOString().slice(0, 10) !== debt_date
    ) {
      return res.status(400).json({
        success: false,
        message: "Debt date is invalid.",
      });
    }

    // Check that the debt exists and calculate payments already made
    const debtResult = await pool.query(
      `SELECT
         debts.debt_id,
         COALESCE(SUM(payments.amount), 0) AS total_paid
       FROM debts
       LEFT JOIN payments
         ON payments.debt_id = debts.debt_id
       WHERE debts.debt_id = $1
       GROUP BY debts.debt_id`,
      [id],
    );

    if (debtResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Debt record not found.",
      });
    }

    const totalPaid = Number(debtResult.rows[0].total_paid);

    if (Math.round(debtAmount * 100) < Math.round(totalPaid * 100)) {
      return res.status(400).json({
        success: false,
        message: `Debt amount cannot be less than the total already paid (${totalPaid.toFixed(2)}).`,
      });
    }

    const result = await pool.query(
      `UPDATE debts
       SET customer_id = $1,
           amount = $2,
           description = $3,
           debt_date = $4,
           due_date = $5
       WHERE debt_id = $6
       RETURNING *`,
      [
        customerId,
        debtAmount,
        description.trim(),
        debt_date,
        due_date || null,
        id,
      ],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Debt record not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Debt updated successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating debt:", error.message);

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "The selected customer does not exist.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update debt record.",
    });
  }
});

/* DELETE: Remove a debt without payment history */
app.delete("/api/debts/:id", async (req, res) => {
  const id = Number(req.params.id);
  let client;

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid debt ID.",
    });
  }

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Find and lock the debt record.
    const debtResult = await client.query(
      `SELECT debt_id
       FROM debts
       WHERE debt_id = $1
       FOR UPDATE`,
      [id],
    );

    if (debtResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Debt record not found.",
      });
    }

    // Protect debts that have recorded payments.
    const paymentResult = await client.query(
      `SELECT payment_id
       FROM payments
       WHERE debt_id = $1
       LIMIT 1`,
      [id],
    );

    if (paymentResult.rowCount > 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "This debt cannot be deleted because it has payment history.",
      });
    }

    // Delete the debt only after the safeguards pass.
    await client.query("DELETE FROM debts WHERE debt_id = $1", [id]);

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Debt deleted successfully.",
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error deleting debt:", error.message);

    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "This debt cannot be deleted because it is referenced by other records.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to delete debt record.",
    });
  } finally {
    client?.release();
  }
});

/* PAYMENT HISTORY */

// GET: Retrieve payment records from PostgreSQL
app.get("/api/payments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        payments.payment_id,
        payments.debt_id,
        payments.amount,
        TO_CHAR(payments.payment_date, 'YYYY-MM-DD') AS payment_date,
        payments.notes,
        payments.created_at,
        debts.description,
        debts.customer_id,
        customers.first_name,
        customers.last_name
      FROM payments
      INNER JOIN debts
        ON payments.debt_id = debts.debt_id
      INNER JOIN customers
        ON debts.customer_id = customers.customer_id
      ORDER BY payments.payment_id DESC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error retrieving payments:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve payment records.",
    });
  }
});

/* POST: Record a payment */

app.post("/api/payments", async (req, res) => {
  const { debt_id, amount, payment_date, notes } = req.body;

  const debtId = Number(debt_id);
  const paymentAmount = Number(amount);

  if (!Number.isInteger(debtId) || debtId < 1) {
    return res.status(400).json({
      success: false,
      message: "Please select a valid debt.",
    });
  }

  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Payment amount must be greater than zero.",
    });
  }

  if (
    typeof payment_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid payment date is required.",
    });
  }

  const date = new Date(`${payment_date}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== payment_date
  ) {
    return res.status(400).json({
      success: false,
      message: "Payment date is invalid.",
    });
  }

  if (notes != null && typeof notes !== "string") {
    return res.status(400).json({
      success: false,
      message: "Payment notes must be text.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const debtResult = await client.query(
      `SELECT debt_id, amount, status
       FROM debts
       WHERE debt_id = $1
       FOR UPDATE`,
      [debtId],
    );

    if (debtResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Debt not found.",
      });
    }

    const debt = debtResult.rows[0];

    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM payments
       WHERE debt_id = $1`,
      [debtId],
    );

    const totalPaid = Number(paidResult.rows[0].total_paid);
    const debtAmount = Number(debt.amount);
    const remaining = Math.round((debtAmount - totalPaid) * 100) / 100;

    if (remaining <= 0) {
      await client.query("ROLLBACK");

      return res.status(409).json({
        success: false,
        message: "This debt has already been fully paid.",
      });
    }

    if (Math.round(paymentAmount * 100) > Math.round(remaining * 100)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: `Payment exceeds the remaining balance of ${remaining.toFixed(2)}.`,
      });
    }

    const paymentResult = await client.query(
      `INSERT INTO payments
        (debt_id, amount, payment_date, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [debtId, paymentAmount, payment_date, notes?.trim() || null],
    );

    const newTotalPaid = Math.round((totalPaid + paymentAmount) * 100) / 100;

    const newStatus = newTotalPaid >= debtAmount ? "Paid" : "Partially Paid";

    await client.query(
      `UPDATE debts
       SET status = $1
       WHERE debt_id = $2`,
      [newStatus, debtId],
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Payment recorded successfully.",
      data: paymentResult.rows[0],
      total_paid: newTotalPaid,
      remaining_balance: Math.round((debtAmount - newTotalPaid) * 100) / 100,
      debt_status: newStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error recording payment:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to record payment.",
    });
  } finally {
    client.release();
  }
});

/* PUT: Update an existing payment */

app.put("/api/payments/:id", async (req, res) => {
  const paymentId = Number(req.params.id);
  const { amount, payment_date, notes } = req.body;
  const paymentAmount = Number(amount);

  // Validate payment ID.
  if (!Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID.",
    });
  }

  // Validate payment amount.
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Payment amount must be greater than zero.",
    });
  }

  // Validate payment date.
  if (
    typeof payment_date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(payment_date)
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid payment date is required.",
    });
  }

  const date = new Date(`${payment_date}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== payment_date
  ) {
    return res.status(400).json({
      success: false,
      message: "Payment date is invalid.",
    });
  }

  if (notes != null && typeof notes !== "string") {
    return res.status(400).json({
      success: false,
      message: "Payment notes must be text.",
    });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Find the payment and identify its debt.
    const paymentResult = await client.query(
      `SELECT payment_id, debt_id
       FROM payments
       WHERE payment_id = $1`,
      [paymentId],
    );

    if (paymentResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    const debtId = paymentResult.rows[0].debt_id;

    // Lock the debt so concurrent payment changes cannot
    // incorrectly exceed its balance.
    const debtResult = await client.query(
      `SELECT debt_id, amount
       FROM debts
       WHERE debt_id = $1
       FOR UPDATE`,
      [debtId],
    );

    if (debtResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Related debt not found.",
      });
    }

    const debtAmount = Number(debtResult.rows[0].amount);

    // Exclude the payment being edited from the existing total.
    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM payments
       WHERE debt_id = $1
         AND payment_id <> $2`,
      [debtId, paymentId],
    );

    const otherPayments = Number(paidResult.rows[0].total_paid);
    const remaining = Math.round((debtAmount - otherPayments) * 100) / 100;

    if (Math.round(paymentAmount * 100) > Math.round(remaining * 100)) {
      await client.query("ROLLBACK");

      return res.status(400).json({
        success: false,
        message: `Payment exceeds the available balance of ${remaining.toFixed(2)}.`,
      });
    }

    // Save the edited payment.
    const updatedPayment = await client.query(
      `UPDATE payments
       SET amount = $1,
           payment_date = $2,
           notes = $3
       WHERE payment_id = $4
       RETURNING *`,
      [paymentAmount, payment_date, notes?.trim() || null, paymentId],
    );

    // Recalculate the total and debt status.
    const newTotalPaid =
      Math.round((otherPayments + paymentAmount) * 100) / 100;

    const newStatus =
      newTotalPaid >= debtAmount
        ? "Paid"
        : newTotalPaid > 0
          ? "Partially Paid"
          : "Unpaid";

    await client.query(
      `UPDATE debts
       SET status = $1
       WHERE debt_id = $2`,
      [newStatus, debtId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Payment updated successfully.",
      data: updatedPayment.rows[0],
      total_paid: newTotalPaid,
      remaining_balance: Math.round((debtAmount - newTotalPaid) * 100) / 100,
      debt_status: newStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});

    console.error("Error updating payment:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update payment.",
    });
  } finally {
    client.release();
  }
});

/* DELETE: Remove a payment and recalculate debt status */

app.delete("/api/payments/:id", async (req, res) => {
  const paymentId = Number(req.params.id);
  let client;

  if (!Number.isInteger(paymentId) || paymentId < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID.",
    });
  }

  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Find the payment and identify its debt.
    const paymentResult = await client.query(
      `SELECT payment_id, debt_id
       FROM payments
       WHERE payment_id = $1`,
      [paymentId],
    );

    if (paymentResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Payment not found.",
      });
    }

    const debtId = paymentResult.rows[0].debt_id;

    // Lock the debt while recalculating its balance and status.
    const debtResult = await client.query(
      `SELECT debt_id, amount
       FROM debts
       WHERE debt_id = $1
       FOR UPDATE`,
      [debtId],
    );

    if (debtResult.rowCount === 0) {
      await client.query("ROLLBACK");

      return res.status(404).json({
        success: false,
        message: "Related debt not found.",
      });
    }

    const debtAmount = Number(debtResult.rows[0].amount);

    // Delete the selected payment from PostgreSQL.
    await client.query(
      `DELETE FROM payments
       WHERE payment_id = $1`,
      [paymentId],
    );

    // Recalculate payments remaining after deletion.
    const paidResult = await client.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_paid
       FROM payments
       WHERE debt_id = $1`,
      [debtId],
    );

    const totalPaid =
      Math.round(Number(paidResult.rows[0].total_paid) * 100) / 100;

    const remainingBalance = Math.round((debtAmount - totalPaid) * 100) / 100;

    const newStatus =
      totalPaid >= debtAmount
        ? "Paid"
        : totalPaid > 0
          ? "Partially Paid"
          : "Unpaid";

    // Update the debt's status.
    await client.query(
      `UPDATE debts
       SET status = $1
       WHERE debt_id = $2`,
      [newStatus, debtId],
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: "Payment deleted successfully.",
      payment_id: paymentId,
      debt_id: debtId,
      total_paid: totalPaid,
      remaining_balance: remainingBalance,
      debt_status: newStatus,
    });
  } catch (error) {
    if (client) {
      await client.query("ROLLBACK").catch(() => {});
    }

    console.error("Error deleting payment:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to delete payment.",
    });
  } finally {
    client?.release();
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
