const express = require('express');
const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

// ================= MIDDLEWARE =================
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));
app.use('/images', express.static('images'));

// ================= CREATE FOLDERS =================
const imagesDir = path.join(__dirname, 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir);
}

// ================= DATABASE SETUP =================
let db;
const dbPath = path.join(__dirname, 'styleme.db');

async function initDatabase() {
  const SQL = await initSqlJs();
  
  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('Database loaded from file');
  } else {
    db = new SQL.Database();
    createTables();
    saveDatabase();
    console.log('New database created');
  }
}

function createTables() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Posts table
  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      img_filename TEXT NOT NULL,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      votes_a INTEGER DEFAULT 0,
      votes_b INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Votes table
  db.run(`
    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_email TEXT NOT NULL,
      vote_choice TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      UNIQUE(post_id, user_email)
    )
  `);
}

function saveDatabase() {
  const data = db.export();
  fs.writeFileSync(dbPath, data);
}

// ================= HELPER FUNCTIONS =================
function runQuery(sql, params = []) {
  try {
    db.run(sql, params);
    saveDatabase();
    return { success: true };
  } catch (error) {
    console.error('Query error:', error);
    return { success: false, error: error.message };
  }
}

function getQuery(sql, params = []) {
  try {
    const result = db.exec(sql, params);
    if (result.length === 0) return null;
    
    const columns = result[0].columns;
    const values = result[0].values[0];
    
    if (!values) return null;
    
    const row = {};
    columns.forEach((col, idx) => {
      row[col] = values[idx];
    });
    
    return row;
  } catch (error) {
    console.error('Query error:', error);
    return null;
  }
}

function getAllQuery(sql, params = []) {
  try {
    const result = db.exec(sql, params);
    if (result.length === 0) return [];
    
    const columns = result[0].columns;
    const values = result[0].values;
    
    return values.map(row => {
      const obj = {};
      columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
  } catch (error) {
    console.error('Query error:', error);
    return [];
  }
}

// ================= AUTH ROUTES =================

// Signup
app.post('/api/signup', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const existingUser = getQuery("SELECT * FROM users WHERE email = ?", [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const result = runQuery("INSERT INTO users (email, password) VALUES (?, ?)", [email, password]);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ message: 'Account created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = getQuery("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ email: user.email, message: 'Login successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= POST ROUTES =================

// Create post
app.post('/api/posts', (req, res) => {
  const { userEmail, imageData, question, optionA, optionB } = req.body;

  if (!userEmail || !imageData || !question || !optionA || !optionB) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    // Save image from base64
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
    const filepath = path.join(imagesDir, filename);

    fs.writeFileSync(filepath, buffer);

    // Save to database
    const result = runQuery(
      "INSERT INTO posts (user_email, img_filename, question, option_a, option_b) VALUES (?, ?, ?, ?, ?)",
      [userEmail, filename, question, optionA, optionB]
    );

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ message: 'Post created successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all posts
app.get('/api/posts', (req, res) => {
  try {
    const posts = getAllQuery("SELECT * FROM posts ORDER BY created_at DESC");
    res.json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete post
app.delete('/api/posts/:id', (req, res) => {
  const { id } = req.params;
  const { userEmail } = req.body;

  try {
    const post = getQuery("SELECT * FROM posts WHERE id = ?", [id]);
    
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.user_email !== userEmail) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Delete image file
    const imagePath = path.join(imagesDir, post.img_filename);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }

    // Delete votes
    runQuery("DELETE FROM votes WHERE post_id = ?", [id]);
    
    // Delete post
    const result = runQuery("DELETE FROM posts WHERE id = ?", [id]);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= VOTE ROUTES =================

// Vote on post
app.post('/api/posts/:id/vote', (req, res) => {
  const { id } = req.params;
  const { userEmail, choice } = req.body;

  if (!userEmail || !choice) {
    return res.status(400).json({ error: 'User email and choice required' });
  }

  if (choice !== 'A' && choice !== 'B') {
    return res.status(400).json({ error: 'Invalid choice' });
  }

  try {
    const existingVote = getQuery("SELECT * FROM votes WHERE post_id = ? AND user_email = ?", [id, userEmail]);
    if (existingVote) {
      return res.status(400).json({ error: 'Already voted' });
    }

    runQuery("INSERT INTO votes (post_id, user_email, vote_choice) VALUES (?, ?, ?)", [id, userEmail, choice]);
    
    if (choice === 'A') {
      runQuery("UPDATE posts SET votes_a = votes_a + 1 WHERE id = ?", [id]);
    } else {
      runQuery("UPDATE posts SET votes_b = votes_b + 1 WHERE id = ?", [id]);
    }

    res.json({ message: 'Vote recorded' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if user has voted
app.get('/api/posts/:id/vote/:userEmail', (req, res) => {
  const { id, userEmail } = req.params;

  try {
    const vote = getQuery("SELECT * FROM votes WHERE post_id = ? AND user_email = ?", [id, userEmail]);
    res.json({ hasVoted: !!vote, vote: vote || null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ================= START SERVER =================
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Database file: ${dbPath}`);
    console.log(`Images folder: ${imagesDir}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});