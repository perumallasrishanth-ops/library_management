LIBRARY MANAGEMENT SYSTEM - SETUP GUIDE
========================================

This project uses:
- HTML for page structure
- CSS for styling
- Browser JavaScript for page behaviour
- Node.js + Express as the JavaScript backend
- MySQL for permanent database storage

IMPORTANT:
A browser-only HTML/CSS/JavaScript website cannot safely connect directly to MySQL.
The included Node.js backend connects the website to your existing MySQL database.

EXPECTED DATABASE
-----------------
Database: library_management

members:
  member_id, name, roll_no, email, phone

books:
  book_id, title, author, category, publisher, quantity

issue_records:
  issue_id, member_id, book_id, issue_date, return_date, status

These are the columns previously discussed. If your actual column names differ,
the SQL in server.js must be adjusted to match your Workbench tables.

SETUP ON WINDOWS
----------------
1. Install Node.js LTS from https://nodejs.org/ if it is not already installed.
2. Extract this ZIP file.
3. Open the extracted "library-management-website" folder.
4. In File Explorer, click the address bar, type cmd, and press Enter.
5. Run:
      npm install
6. Create a copy of .env.example and name the copy .env.
   (Make sure Windows does not name it .env.txt.)
7. Open .env in Notepad and enter your MySQL password after DB_PASSWORD=.
   Do not share this file or your password.
8. Save .env.
9. Start the website:
      npm start
10. Open your browser and visit:
      http://localhost:3000

MYSQL NOTES
-----------
- Make sure MySQL80 is running.
- The database and tables should already exist in MySQL Workbench.
- This project does not create or delete your database.
- Book issue/return updates the books.quantity value in a transaction.
  This assumes quantity means the number of currently available copies.
- Test with a small amount of sample data first.

FEATURES
--------
- Dashboard statistics
- Add and search books
- Register and search members
- Issue books to members
- Return books
- View issue and return history

If you see a database error, compare your actual Workbench column names with
the expected database section above. Never put your MySQL password in public
HTML or browser JavaScript files.
