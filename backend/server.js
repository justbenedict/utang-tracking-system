const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 5000;

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
      data: result.rows
    });
  } catch (error) {
    console.error("Error retrieving customers:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve customers."
    });
  }
});

// POST: Register a customer
app.post("/api/customers", async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      contact_number,
      address
    } = req.body;

    if (
      typeof first_name !== "string" ||
      !first_name.trim() ||
      typeof last_name !== "string" ||
      !last_name.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "First name and last name are required."
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
        address?.trim() || null
      ]
    );

    res.status(201).json({
      success: true,
      message: "Customer registered successfully.",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error registering customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to register customer."
    });
  }
});

// PUT: Update a customer
app.put("/api/customers/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      first_name,
      last_name,
      contact_number,
      address
    } = req.body;

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID."
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
        message: "First name and last name are required."
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
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer updated successfully.",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error updating customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to update customer."
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
        message: "Invalid customer ID."
      });
    }

    const result = await pool.query(
      `DELETE FROM customers
       WHERE customer_id = $1
       RETURNING customer_id`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Customer not found."
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully."
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message: "This customer has debt records and cannot be deleted."
      });
    }

    console.error("Error deleting customer:", error.message);
    res.status(500).json({
      success: false,
      message: "Failed to delete customer."
    });
  }
});


/* POST: Save a debt record to PostgreSQL */
app.post("/api/debts", async (req, res) => {
  try {
    const {
      customer_id,
      amount,
      description,
      debt_date,
      due_date
    } = req.body;

    const customerId = Number(customer_id);
    const debtAmount = Number(amount);

    if (!Number.isInteger(customerId) || customerId < 1) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid customer."
      });
    }

    if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Debt amount must be greater than zero."
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
        message: "A description and valid debt date are required."
      });
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
        "Unpaid"
      ]
    );

    res.status(201).json({
      success: true,
      message: "Debt saved successfully.",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Error saving debt:", error.message);

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "The selected customer does not exist."
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to save debt record."
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
        debts.debt_date,
        debts.due_date,
        debts.status
      FROM debts
      INNER JOIN customers
        ON debts.customer_id = customers.customer_id
      ORDER BY debts.debt_id DESC
    `);

    res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error("Error retrieving debts:", error.message);

    res.status(500).json({
      success: false,
      message: "Failed to retrieve debt records."
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
