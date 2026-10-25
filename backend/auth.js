const pool = require("./db");
const jwt = require("jsonwebtoken");

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Access denied. Please log in.",
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({
        message: "Invalid or expired token.",
      });
    }

    pool
      .query("SELECT is_active FROM users WHERE user_id = $1", [user.userId])
      .then((result) => {
        if (result.rowCount === 0 || !result.rows[0].is_active) {
          return res.status(403).json({
            message: "This account is inactive or no longer exists.",
          });
        }

        req.user = user;
        next();
      })
      .catch((error) => {
        console.error("Authentication check failed:", error.message);

        return res.status(500).json({
          message: "Failed to verify account status.",
        });
      });
  });
}

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
};
