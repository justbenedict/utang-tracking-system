const pool = require("./db");

async function testConnection() {
  try {
    const result = await pool.query(
      "SELECT current_database() AS database, version() AS version"
    );

    console.log("Connected to PostgreSQL successfully!");
    console.log("Database:", result.rows[0].database);
    console.log("PostgreSQL:", result.rows[0].version);

  } catch (error) {
    console.error("Database connection failed:");
    console.error(error.message);

  } finally {
    await pool.end();
  }
}

testConnection();
