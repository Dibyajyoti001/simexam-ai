import { initDatabase } from "./src/lib/db.js"
import dotenv from "dotenv"
dotenv.config()

initDatabase().then(() => {
  console.log("Database initialized successfully!")
  process.exit(0)
}).catch(err => {
  console.error(err)
  process.exit(1)
})
