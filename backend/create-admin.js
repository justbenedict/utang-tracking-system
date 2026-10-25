require("dotenv").config();

const bcrypt = require("bcryptjs");
const readline = require("readline");
const pool = require("./db");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function main() {
  try {
    const username = (await ask("Admin username: ")).trim();
    const password = await ask("Admin password: ");

    if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
      throw new Error(
        "Username must be 3-50 characters using letters, numbers, _, ., or -.",
      );
    }

    if (password.length < 12) {
      throw new Error("Password must be at least 12 characters.");
    }

    const existing = await pool.query(
      "SELECT user_id FROM users WHERE username = $1",
      [username],
    );

    if (existing.rows.length > 0) {
      throw new Error("That username already exists.");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await pool.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES ($1, $2, 'admin')`,
      [username, passwordHash],
    );

    console.log(`Administrator "${username}" created successfully.`);
  } catch (error) {
    console.error("Could not create administrator:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
