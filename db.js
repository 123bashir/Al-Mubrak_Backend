import mysql from "mysql2";
import dotenv from "dotenv";

dotenv.config();

export const db = mysql.createPool({
  host: "localhost",
  user:  "app_user",
  password:  "Candd4611@", // Replace with your actual MySQL password
  database: "almubarak_db",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 30000
}).promise();

console.log("Alhamdulillah MySQL pool configured successfully for AWS EC2");
