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

// GET API: Retrieve debt records from PostgreSQL
app.get("/api/debts", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        debts.debt_id,
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
