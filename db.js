// backend/db.js
import mysql from "mysql2/promise";

// // Development database configuration
// export const db = mysql.createPool({
//   host: "localhost",
//   user: "root",
//   password: "Candd4611@",
//   database: "commerce",
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0
// });

export const db = mysql.createPool({
  host: "localhost",
  user: "almubara_almubarak_db",
  password: "Candd4611@",
  database: "almubara_almubarak_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});
console.log("Alhamdulillah MySQL connected successfully");
