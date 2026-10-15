import mysql from "mysql2";
import dotenv from "dotenv";

dotenv.config();

export const db = mysql.createPool({
  host: "86.107.77.205",
  user: "almubara_almubarak_db",
  password: "Candd4611@",
  database: "almubara_almubarak_db",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 2,          // Keep low for serverless to protect TelaHosting limits
  queueLimit: 0,
  connectTimeout: 30000        // 30 seconds timeout for remote cPanel connection
}).promise();                    // Enables async/await query execution

console.log("Alhamdulillah MySQL pool configured successfully");