
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Temporary debt records for testing
const debts = [
  {
    id: 1,
    name: "Juan Dela Cruz",
    amount: 1500,
    date: "2026-10-12",
    description: "School expenses",
    status: "Unpaid"
  },
  {
    id: 2,
    name: "Maria Santos",
    amount: 800,
    date: "2026-10-11",
    description: "Food expenses",
    status: "Unpaid"
  }
];

// GET API: Retrieve all debt records
app.get("/api/debts", (req, res) => {
  res.status(200).json({
    success: true,
    count: debts.length,
    data: debts
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
