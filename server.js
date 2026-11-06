require("dotenv").config();

const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "library_management",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, message: "Connected to MySQL" });
  } catch (err) {
    res.status(500).json({ ok: false, message: "Could not connect to MySQL. Check your .env settings." });
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const [[books]] = await pool.query("SELECT COUNT(*) AS totalBooks, COALESCE(SUM(quantity),0) AS availableCopies FROM books");
    const [[members]] = await pool.query("SELECT COUNT(*) AS totalMembers FROM members");
    const [[issues]] = await pool.query("SELECT COUNT(*) AS activeIssues FROM issue_records WHERE status = 'Issued'");
    res.json({ ...books, ...members, ...issues });
  } catch (err) {
    res.status(500).json({ error: "Unable to load dashboard." });
  }
});

app.get("/api/books", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT book_id, title, author, category, publisher, quantity FROM books ORDER BY book_id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Unable to load books." });
  }
});

app.post("/api/books", async (req, res) => {
  const { title, author, category, publisher, quantity } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: "Book title is required." });
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ error: "Quantity must be a whole number (0 or more)." });

  try {
    const [result] = await pool.query(
      "INSERT INTO books (title, author, category, publisher, quantity) VALUES (?, ?, ?, ?, ?)",
      [String(title).trim(), author || null, category || null, publisher || null, qty]
    );
    res.status(201).json({ message: "Book added successfully.", book_id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: "Could not add book. Check that your books table columns match the project schema." });
  }
});

app.get("/api/members", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT member_id, name, roll_no, email, phone FROM members ORDER BY member_id DESC");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Unable to load members." });
  }
});

app.post("/api/members", async (req, res) => {
  const { name, roll_no, email, phone } = req.body;
  if (!name || !String(name).trim() || !roll_no || !String(roll_no).trim()) {
    return res.status(400).json({ error: "Member name and roll number are required." });
  }
  try {
    const [result] = await pool.query(
      "INSERT INTO members (name, roll_no, email, phone) VALUES (?, ?, ?, ?)",
      [String(name).trim(), String(roll_no).trim(), email || null, phone || null]
    );
    res.status(201).json({ message: "Member registered successfully.", member_id: result.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That roll number is already registered." });
    res.status(500).json({ error: "Could not add member. Check your members table columns." });
  }
});

app.get("/api/issues", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT ir.issue_id, ir.member_id, ir.book_id, ir.issue_date, ir.return_date, ir.status,
             m.name AS member_name, m.roll_no, b.title AS book_title
      FROM issue_records ir
      JOIN members m ON m.member_id = ir.member_id
      JOIN books b ON b.book_id = ir.book_id
      ORDER BY ir.issue_id DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Unable to load issue records." });
  }
});

app.post("/api/issues", async (req, res) => {
  const memberId = Number(req.body.member_id);
  const bookId = Number(req.body.book_id);
  if (!Number.isInteger(memberId) || !Number.isInteger(bookId)) {
    return res.status(400).json({ error: "Choose a valid member and book." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [members] = await conn.query("SELECT member_id FROM members WHERE member_id = ?", [memberId]);
    if (!members.length) throw new Error("Member not found.");

    const [books] = await conn.query("SELECT book_id, quantity FROM books WHERE book_id = ? FOR UPDATE", [bookId]);
    if (!books.length) throw new Error("Book not found.");
    if (Number(books[0].quantity) < 1) throw new Error("No available copies of this book.");

    const [result] = await conn.query(
      "INSERT INTO issue_records (member_id, book_id, issue_date, status) VALUES (?, ?, CURDATE(), 'Issued')",
      [memberId, bookId]
    );
    await conn.query("UPDATE books SET quantity = quantity - 1 WHERE book_id = ?", [bookId]);

    await conn.commit();
    res.status(201).json({ message: "Book issued successfully.", issue_id: result.insertId });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message || "Could not issue book." });
  } finally {
    conn.release();
  }
});

app.put("/api/issues/:id/return", async (req, res) => {
  const issueId = Number(req.params.id);
  if (!Number.isInteger(issueId)) return res.status(400).json({ error: "Invalid issue ID." });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT issue_id, book_id, status FROM issue_records WHERE issue_id = ? FOR UPDATE",
      [issueId]
    );
    if (!rows.length) throw new Error("Issue record not found.");
    if (rows[0].status !== "Issued") throw new Error("This book has already been returned.");

    await conn.query(
      "UPDATE issue_records SET return_date = CURDATE(), status = 'Returned' WHERE issue_id = ?",
      [issueId]
    );
    await conn.query("UPDATE books SET quantity = quantity + 1 WHERE book_id = ?", [rows[0].book_id]);
    await conn.commit();
    res.json({ message: "Book returned successfully." });
  } catch (err) {
    await conn.rollback();
    res.status(400).json({ error: err.message || "Could not return book." });
  } finally {
    conn.release();
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Library Management System running at http://localhost:${port}`));
