const express = require("express");
const cors = require("cors");
require("dotenv").config();

const pool = require("./db");

const { authenticateToken, authorizeRoles } = require("./auth");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

async function writeAuditLog(
  client,
  {
    actorUserId,
    customerId = null,
    debtId = null,
    paymentId = null,
    action,
    entityType,
    entityId = null,
    oldValues = null,
    newValues = null,
    reason = null,
  },
) {
  await client.query(
    `INSERT INTO audit_logs (
       actor_user_id,
       customer_id,
       debt_id,
       payment_id,
       action,
       entity_type,
       entity_id,
       old_values,
       new_values,
       reason
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8::jsonb, $9::jsonb, $10
     )`,
    [
      actorUserId,
      customerId,
      debtId,
      paymentId,
      action,
      entityType,
      entityId,
      oldValues === null ? null : JSON.stringify(oldValues),
      newValues === null ? null : JSON.stringify(newValues),
      reason,
    ],
  );
}

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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string" ||
      !username.trim() ||
      !password
    ) {
      return res.status(400).json({
        message: "Username and password are required.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        message: "Server authentication is not configured.",
      });
    }

    const result = await pool.query(
      `SELECT user_id, username, password_hash, role,
              customer_id, is_active
       FROM users
       WHERE username = $1`,
      [username.trim()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        message: "This account is disabled.",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid username or password.",
      });
    }

    const token = jwt.sign(
      {
        userId: user.user_id,
        username: user.username,
        role: user.role,
        customerId: user.customer_id,
      },
      process.env.JWT_SECRET,
      { expiresIn: "8h" },
    );

    return res.json({
      message: "Login successful.",
      token,
      user: {
        userId: user.user_id,
        username: user.username,
        role: user.role,
        customerId: user.customer_id,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      message: "An error occurred during login.",
    });
  }
});

/* POST: Admin creates a staff or customer account */
app.post(
  "/api/admin/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { username, password, role, customerId } = req.body;

      // Validate username.
      if (
        typeof username !== "string" ||
        username.trim().length < 3 ||
        username.trim().length > 50
      ) {
        return res.status(400).json({
          success: false,
          message: "Username must be between 3 and 50 characters.",
        });
      }

      // Validate password.
      if (typeof password !== "string" || password.length < 12) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 12 characters long.",
        });
      }

      // Only staff and customer accounts can be created through this route.
      if (!["staff", "customer"].includes(role)) {
        return res.status(400).json({
          success: false,
          message: "Role must be either staff or customer.",
        });
      }

      let linkedCustomerId = null;

      if (role === "customer") {
        linkedCustomerId = Number(customerId);

        if (!Number.isInteger(linkedCustomerId) || linkedCustomerId < 1) {
          return res.status(400).json({
            success: false,
            message: "A valid customer ID is required for customer accounts.",
          });
        }

        const customerResult = await pool.query(
          "SELECT customer_id FROM customers WHERE customer_id = $1",
          [linkedCustomerId],
        );

        if (customerResult.rowCount === 0) {
          return res.status(404).json({
            success: false,
            message: "The selected customer does not exist.",
          });
        }
      } else if (customerId != null && customerId !== "") {
        return res.status(400).json({
          success: false,
          message: "Staff accounts must not be linked to a customer ID.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const result = await pool.query(
        `INSERT INTO users
          (username, password_hash, role, customer_id)
         VALUES ($1, $2, $3, $4)
         RETURNING user_id, username, role, customer_id, is_active, created_at`,
        [username.trim(), passwordHash, role, linkedCustomerId],
      );

      return res.status(201).json({
        success: true,
        message: "User account created successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "That username or customer account is already in use.",
        });
      }

      console.error("Error creating user account:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to create user account.",
      });
    }
  },
);

/* POST: Admin assigns a customer to a staff member */
app.post(
  "/api/admin/staff-assignments",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const { staffUserId, customerId } = req.body;

      const staffId = Number(staffUserId);
      const linkedCustomerId = Number(customerId);

      if (
        !Number.isInteger(staffId) ||
        staffId < 1 ||
        !Number.isInteger(linkedCustomerId) ||
        linkedCustomerId < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "Valid staff user ID and customer ID are required.",
        });
      }

      const staffResult = await pool.query(
        `SELECT user_id
         FROM users
         WHERE user_id = $1
           AND role = 'staff'
           AND is_active = TRUE`,
        [staffId],
      );

      if (staffResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Active staff account not found.",
        });
      }

      const customerResult = await pool.query(
        "SELECT customer_id FROM customers WHERE customer_id = $1",
        [linkedCustomerId],
      );

      if (customerResult.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Customer not found.",
        });
      }

      const result = await pool.query(
        `INSERT INTO staff_assignments (staff_user_id, customer_id)
         VALUES ($1, $2)
         ON CONFLICT (staff_user_id, customer_id) DO NOTHING
         RETURNING staff_user_id, customer_id, assigned_at`,
        [staffId, linkedCustomerId],
      );

      if (result.rowCount === 0) {
        return res.status(200).json({
          success: true,
          message: "This customer is already assigned to that staff member.",
        });
      }

      return res.status(201).json({
        success: true,
        message: "Customer assigned to staff successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Error assigning customer to staff:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to assign customer to staff.",
      });
    }
  },
);

/* GET: Admin views all staff-customer assignments */
app.get(
  "/api/admin/staff-assignments",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           sa.staff_user_id,
           u.username AS staff_username,
           sa.customer_id,
           c.first_name,
           c.last_name,
           sa.assigned_at
         FROM staff_assignments AS sa
         INNER JOIN users AS u
           ON u.user_id = sa.staff_user_id
         INNER JOIN customers AS c
           ON c.customer_id = sa.customer_id
         ORDER BY u.username, c.first_name, c.last_name`,
      );

      return res.status(200).json({
        success: true,
        count: result.rowCount,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error fetching staff assignments:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve staff assignments.",
      });
    }
  },
);

/* GET: Admin views all user accounts */
app.get(
  "/api/admin/users",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT
           user_id,
           username,
           role,
           customer_id,
           is_active,
           created_at
         FROM users
         ORDER BY created_at DESC`,
      );

      return res.status(200).json({
        success: true,
        count: result.rowCount,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error fetching user accounts:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to retrieve user accounts.",
      });
    }
  },
);

/* PATCH: Admin activates or deactivates an account */
app.patch(
  "/api/admin/users/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { isActive } = req.body;

      if (!Number.isInteger(userId) || userId < 1) {
        return res.status(400).json({
          success: false,
          message: "A valid user ID is required.",
        });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false.",
        });
      }

      const result = await pool.query(
        `UPDATE users
         SET is_active = $1
         WHERE user_id = $2
           AND role IN ('staff', 'customer')
         RETURNING user_id, username, role, customer_id, is_active`,
        [isActive, userId],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: "Staff or customer account not found.",
        });
      }

      return res.status(200).json({
        success: true,
        message: isActive
          ? "Account activated successfully."
          : "Account deactivated successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("Error updating account status:", error.message);

      return res.status(500).json({
        success: false,
        message: "Failed to update account status.",
      });
    }
  },
);

// Home route
app.get("/", (req, res) => {
  res.send("Utang Tracking System API is running!");
});

/* CUSTOMER CRUD */

// GET: Retrieve customers based on user role
app.get(
  "/api/customers",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    try {
      let result;

      if (req.user.role === "admin") {
        result = await pool.query(`
          SELECT customer_id, first_name, last_name,
                 contact_number, address, created_at
          FROM customers
          ORDER BY customer_id DESC
        `);
      } else {
        result = await pool.query(
          `SELECT c.customer_id, c.first_name, c.last_name,
                  c.contact_number, c.address, c.created_at
           FROM customers c
           INNER JOIN staff_assignments sa
             ON sa.customer_id = c.customer_id
           WHERE sa.staff_user_id = $1
           ORDER BY c.customer_id DESC`,
          [req.user.userId],
        );
      }

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
  },
);

// POST: Register a customer
app.post(
  "/api/customers",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
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

      let client;

      try {
        client = await pool.connect();
        await client.query("BEGIN");

        const result = await client.query(
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

        const newCustomer = result.rows[0];

        // Automatically assign new customers created by Staff.
        if (req.user.role === "staff") {
          await client.query(
            `INSERT INTO staff_assignments (staff_user_id, customer_id)
       VALUES ($1, $2)
       ON CONFLICT (staff_user_id, customer_id) DO NOTHING`,
            [req.user.userId, newCustomer.customer_id],
          );
        }

        await client.query("COMMIT");

        return res.status(201).json({
          success: true,
          message: "Customer registered successfully.",
          data: newCustomer,
        });
      } catch (error) {
        if (client) {
          await client.query("ROLLBACK").catch(() => {});
        }

        throw error;
      } finally {
        client?.release();
      }
    } catch (error) {
      console.error("Error registering customer:", error.message);
      res.status(500).json({
        success: false,
        message: "Failed to register customer.",
      });
    }
  },
);

// PUT: Update a customer
app.put(
  "/api/customers/:id",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { first_name, last_name, contact_number, address } = req.body;

      if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid customer ID.",
        });
      }

      // Staff may update only their assigned customers.
      if (req.user.role === "staff") {
        const assignment = await pool.query(
          `SELECT 1
     FROM staff_assignments
     WHERE staff_user_id = $1
       AND customer_id = $2`,
          [req.user.userId, id],
        );

        if (assignment.rowCount === 0) {
          return res.status(403).json({
            success: false,
            message: "You can only update customers assigned to you.",
          });
        }
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

      if (address != null && typeof address !== "string") {
        return res.status(400).json({
          success: false,
          message: "Address must be text.",
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
  },
);

// DELETE: Delete a customer
app.delete(
  "/api/customers/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
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
  },
);

/* POST: Save a debt record to PostgreSQL */
app.post(
  "/api/debts",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    try {
      const { customer_id, amount, description, debt_date, due_date } =
        req.body;

      const customerId = Number(customer_id);
      const debtAmount = Number(amount);

      if (!Number.isInteger(customerId) || customerId < 1) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid customer.",
        });
      }

      // Staff can create debts only for assigned customers.
      if (req.user.role === "staff") {
        const assignmentResult = await pool.query(
          `SELECT 1
         FROM staff_assignments
         WHERE staff_user_id = $1
           AND customer_id = $2`,
          [req.user.userId, customerId],
        );

        if (assignmentResult.rowCount === 0) {
          return res.status(403).json({
            success: false,
            message: "You are not assigned to this customer.",
          });
        }
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
  },
);

/* GET: Retrieve debt records */

app.get(
  "/api/debts",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    try {
      let query = `
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
      `;

      const params = [];

      if (req.user.role === "staff") {
        query += `
          INNER JOIN staff_assignments sa
            ON sa.customer_id = debts.customer_id
          WHERE sa.staff_user_id = $1
        `;

        params.push(req.user.userId);
      }

      query += ` ORDER BY debts.debt_id DESC`;

      const result = await pool.query(query, params);

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
  },
);

/* GET: Retrieve debts belonging to the logged-in customer */
app.get(
  "/api/customer/my-debts",
  authenticateToken,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const customerId = req.user.customerId;

      if (!customerId) {
        return res.status(403).json({
          success: false,
          message: "No customer account is linked to this login.",
        });
      }

      const result = await pool.query(
        `
          SELECT
            debts.debt_id,
            debts.customer_id,
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
          WHERE debts.customer_id = $1
          ORDER BY debts.debt_id DESC
        `,
        [customerId],
      );

      res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows,
      });
    } catch (error) {
      console.error("Error retrieving customer debts:", error.message);

      res.status(500).json({
        success: false,
        message: "Failed to retrieve your debt records.",
      });
    }
  },
);

/* GET: Retrieve payment history for the logged-in customer */
app.get(
  "/api/customer/my-payments",
  authenticateToken,
  authorizeRoles("customer"),
  async (req, res) => {
    try {
      const customerId = req.user.customerId;

      if (!customerId) {
        return res.status(403).json({
          success: false,
          message: "No customer account is linked to this login.",
        });
      }

      const result = await pool.query(
        `
          SELECT
            payments.payment_id,
            payments.debt_id,
            payments.amount,
            TO_CHAR(payments.payment_date, 'YYYY-MM-DD') AS payment_date,
            payments.notes,
            payments.created_at,
            debts.description
          FROM payments
          INNER JOIN debts
            ON payments.debt_id = debts.debt_id
          WHERE debts.customer_id = $1
          ORDER BY payments.payment_id DESC
        `,
        [customerId],
      );

      res.status(200).json({
        success: true,
        count: result.rows.length,
        data: result.rows,
      });
    } catch (error) {
      console.error(
        "Error retrieving customer payment history:",
        error.message,
      );

      res.status(500).json({
        success: false,
        message: "Failed to retrieve your payment history.",
      });
    }
  },
);

/* PUT: Update an existing debt with audit logging */
app.put(
  "/api/debts/:id",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    const id = Number(req.params.id);
    const { customer_id, amount, description, debt_date, due_date } = req.body;

    const customerId = Number(customer_id);
    const debtAmount = Number(amount);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({
        success: false,
        message: "Invalid debt ID.",
      });
    }

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

    let client;

    try {
      client = await pool.connect();
      await client.query("BEGIN");

      // Lock the debt so its details and payments cannot be
      // inconsistently changed during this update.
      const debtResult = await client.query(
        `SELECT
           debt_id,
           customer_id,
           amount,
           description,
           debt_date,
           due_date
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

      const existingDebt = debtResult.rows[0];

      // Staff may update only debts belonging to assigned customers.
      if (req.user.role === "staff") {
        const assignmentResult = await client.query(
          `SELECT 1
           FROM staff_assignments
           WHERE staff_user_id = $1
             AND customer_id = $2`,
          [req.user.userId, existingDebt.customer_id],
        );

        if (assignmentResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(403).json({
            success: false,
            message: "You are not assigned to this debt's customer.",
          });
        }

        // Staff cannot move a debt to another unassigned customer.
        const targetAssignmentResult = await client.query(
          `SELECT 1
           FROM staff_assignments
           WHERE staff_user_id = $1
             AND customer_id = $2`,
          [req.user.userId, customerId],
        );

        if (targetAssignmentResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(403).json({
            success: false,
            message: "You are not assigned to the selected customer.",
          });
        }

        // Staff cannot change the original principal amount.
        if (
          Math.round(debtAmount * 100) !==
          Math.round(Number(existingDebt.amount) * 100)
        ) {
          await client.query("ROLLBACK");

          return res.status(403).json({
            success: false,
            message:
              "Staff cannot change the original debt amount. Please request Admin approval.",
          });
        }
      }

      // Calculate the total already paid.
      const paidResult = await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM payments
         WHERE debt_id = $1`,
        [id],
      );

      const totalPaid = Number(paidResult.rows[0].total_paid);

      if (Math.round(debtAmount * 100) < Math.round(totalPaid * 100)) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          success: false,
          message: `Debt amount cannot be less than the total already paid (${totalPaid.toFixed(2)}).`,
        });
      }

      // Save the updated debt.
      const result = await client.query(
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

      const updatedDebt = result.rows[0];

      // Record the old and new debt values in the same transaction.
      await writeAuditLog(client, {
        actorUserId: req.user.userId,
        customerId: updatedDebt.customer_id,
        debtId: id,
        action: "DEBT_UPDATED",
        entityType: "debt",
        entityId: id,
        oldValues: {
          customer_id: existingDebt.customer_id,
          amount: Number(existingDebt.amount),
          description: existingDebt.description,
          debt_date: existingDebt.debt_date,
          due_date: existingDebt.due_date,
        },
        newValues: {
          customer_id: updatedDebt.customer_id,
          amount: Number(updatedDebt.amount),
          description: updatedDebt.description,
          debt_date: updatedDebt.debt_date,
          due_date: updatedDebt.due_date,
        },
      });

      await client.query("COMMIT");

      return res.status(200).json({
        success: true,
        message: "Debt updated successfully.",
        data: updatedDebt,
      });
    } catch (error) {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
      }

      console.error("Error updating debt:", error.message);

      if (error.code === "23503") {
        return res.status(400).json({
          success: false,
          message: "The selected customer does not exist.",
        });
      }

      return res.status(500).json({
        success: false,
        message: "Failed to update debt record.",
      });
    } finally {
      client?.release();
    }
  },
);

/* DELETE: Remove a debt without payment history */
app.delete(
  "/api/debts/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
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
        `SELECT debt_id, customer_id
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
          message:
            "This debt cannot be deleted because it has payment history.",
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
  },
);

/* PAYMENT HISTORY */

/* GET: Retrieve payment records */

app.get(
  "/api/payments",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
    try {
      let query = `
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
      `;

      const params = [];

      if (req.user.role === "staff") {
        query += `
          INNER JOIN staff_assignments sa
            ON sa.customer_id = debts.customer_id
          WHERE sa.staff_user_id = $1
        `;

        params.push(req.user.userId);
      }

      query += ` ORDER BY payments.payment_id DESC`;

      const result = await pool.query(query, params);

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
  },
);

/* POST: Record a payment */

app.post(
  "/api/payments",
  authenticateToken,
  authorizeRoles("admin", "staff"),
  async (req, res) => {
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
        `SELECT debt_id, customer_id, amount, status
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

      // Staff may record payments only for assigned customers.
      if (req.user.role === "staff") {
        const assignmentResult = await client.query(
          `SELECT 1
     FROM staff_assignments
     WHERE staff_user_id = $1
       AND customer_id = $2`,
          [req.user.userId, debt.customer_id],
        );

        if (assignmentResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(403).json({
            success: false,
            message: "You are not assigned to this customer.",
          });
        }
      }

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

      await writeAuditLog(client, {
        actorUserId: req.user.userId,
        customerId: debt.customer_id,
        debtId: debtId,
        paymentId: paymentResult.rows[0].payment_id,
        action: "PAYMENT_RECORDED",
        entityType: "payment",
        entityId: paymentResult.rows[0].payment_id,
        newValues: {
          amount: paymentAmount,
          payment_date,
          notes: notes?.trim() || null,
        },
      });

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
  },
);

/* PUT: Update an existing payment */

app.put(
  "/api/payments/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
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
        `SELECT
     payment_id,
     debt_id,
     amount,
     payment_date,
     notes
   FROM payments
   WHERE payment_id = $1
   FOR UPDATE`,
        [paymentId],
      );

      if (paymentResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Payment not found.",
        });
      }

      // Staff can edit payments only for assigned customers.
      if (req.user.role === "staff") {
        const assignmentResult = await client.query(
          `SELECT 1
           FROM staff_assignments AS sa
           INNER JOIN debts AS d
             ON d.customer_id = sa.customer_id
           WHERE sa.staff_user_id = $1
             AND d.debt_id = $2`,
          [req.user.userId, paymentResult.rows[0].debt_id],
        );

        if (assignmentResult.rowCount === 0) {
          await client.query("ROLLBACK");

          return res.status(403).json({
            success: false,
            message: "You are not assigned to this payment's customer.",
          });
        }
      }

      const debtId = paymentResult.rows[0].debt_id;

      // Lock the debt so concurrent payment changes cannot
      // incorrectly exceed its balance.

      const debtResult = await client.query(
        `SELECT debt_id, customer_id, amount
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

      const oldPayment = paymentResult.rows[0];
      const newPayment = updatedPayment.rows[0];

      await writeAuditLog(client, {
        actorUserId: req.user.userId,
        customerId: debtResult.rows[0].customer_id,
        debtId,
        paymentId,
        action: "PAYMENT_UPDATED",
        entityType: "payment",
        entityId: paymentId,
        oldValues: {
          amount: Number(oldPayment.amount),
          payment_date: oldPayment.payment_date,
          notes: oldPayment.notes,
        },
        newValues: {
          amount: Number(newPayment.amount),
          payment_date: newPayment.payment_date,
          notes: newPayment.notes,
        },
      });

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
  },
);

/* DELETE: Remove a payment and recalculate debt status */

app.delete(
  "/api/payments/:id",
  authenticateToken,
  authorizeRoles("admin"),
  async (req, res) => {
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

      // Find and lock the payment before modifying it.
      const paymentResult = await client.query(
        `SELECT payment_id, debt_id, amount, payment_date, notes, created_at
         FROM payments
         WHERE payment_id = $1
         FOR UPDATE`,
        [paymentId],
      );

      if (paymentResult.rowCount === 0) {
        await client.query("ROLLBACK");

        return res.status(404).json({
          success: false,
          message: "Payment not found.",
        });
      }

      const payment = paymentResult.rows[0];
      const debtId = payment.debt_id;

      // Lock the related debt.
      const debtResult = await client.query(
        `SELECT debt_id, customer_id, amount
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

      const debt = debtResult.rows[0];
      const debtAmount = Number(debt.amount);

      // Record the original payment details before deletion.
      await writeAuditLog(client, {
        actorUserId: req.user.userId,
        customerId: debt.customer_id,
        debtId,
        paymentId,
        action: "PAYMENT_DELETED",
        entityType: "payment",
        entityId: paymentId,
        oldValues: {
          amount: payment.amount,
          payment_date: payment.payment_date,
          notes: payment.notes,
          debt_id: payment.debt_id,
          created_at: payment.created_at,
        },
        newValues: null,
        reason: "Payment deleted by administrator",
      });

      // Delete the payment.
      await client.query(
        `DELETE FROM payments
         WHERE payment_id = $1`,
        [paymentId],
      );

      // Recalculate the remaining payments.
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
  },
);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
