const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'mysecretkey',
  resave: false,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Accounts file
const ACCOUNTS_FILE = path.join(__dirname, 'accounts.json');
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([]));

// Passport serialize
passport.serializeUser((user, done) => done(null, user.email));
passport.deserializeUser((email, done) => {
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE));
  const user = accounts.find(u => u.email === email);
  done(null, user);
});

// Google OAuth
passport.use(new GoogleStrategy({
    clientID: 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    callbackURL: '/auth/google/callback'
  },
  (accessToken, refreshToken, profile, done) => {
    const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE));
    let user = accounts.find(u => u.googleId === profile.id);
    if (!user) {
      user = { email: profile.emails[0].value, googleId: profile.id, username: profile.displayName };
      accounts.push(user);
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts));
    }
    done(null, user);
  }
));

// Ensure uploads folder
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(path.join(UPLOAD_DIR, 'public'))) fs.mkdirSync(path.join(UPLOAD_DIR, 'public'));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.visibility === 'public' ? 'public' : req.user.username;
    const dir = path.join(UPLOAD_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ----------- Authentication Routes -----------

// Register
app.post('/register', async (req, res) => {
  const { email, password, username } = req.body;
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE));
  if (accounts.find(u => u.email === email)) return res.status(400).json({ error: 'Email exists' });

  const hash = await bcrypt.hash(password, 10);
  const user = { email, username, password: hash };
  accounts.push(user);
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts));
  req.session.user = user;
  res.json({ message: 'Registered successfully' });
});

// Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE));
  const user = accounts.find(u => u.email === email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'Invalid credentials' });

  req.session.user = user;
  res.json({ message: 'Login successful' });
});

// Google auth
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => { res.redirect('/'); }
);

// Middleware to protect routes
function ensureAuth(req, res, next) {
  if (req.session.user || req.user) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

// ----------- File Routes -----------

// Upload
app.post('/api/upload', ensureAuth, upload.single('file'), (req, res) => {
  res.json({ message: 'File uploaded!' });
});

// List files (public + user private)
app.get('/api/files', ensureAuth, (req, res) => {
  const user = req.session.user || req.user;
  let files = [];

  // Public files
  const publicFiles = fs.readdirSync(path.join(UPLOAD_DIR, 'public')).map(f => {
    const stats = fs.statSync(path.join(UPLOAD_DIR, 'public', f));
    return { name: f, owner: 'Public', size: stats.size, mtime: stats.mtime, visibility: 'public' };
  });
  files.push(...publicFiles);

  // User private files
  const userDir = path.join(UPLOAD_DIR, user.username);
  if (fs.existsSync(userDir)) {
    const privateFiles = fs.readdirSync(userDir).map(f => {
      const stats = fs.statSync(path.join(userDir, f));
      return { name: f, owner: user.username, size: stats.size, mtime: stats.mtime, visibility: 'private' };
    });
    files.push(...privateFiles);
  }

  res.json(files);
});

// Delete file (only owner)
app.delete('/api/delete/:filename', ensureAuth, (req, res) => {
  const user = req.session.user || req.user;
  const filename = req.params.filename;

  let filePath = path.join(UPLOAD_DIR, 'public', filename);
  let owner = 'Public';
  if (!fs.existsSync(filePath)) {
    filePath = path.join(UPLOAD_DIR, user.username, filename);
    owner = user.username;
  }

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  if (owner !== user.username && owner !== 'Public') return res.status(403).json({ error: 'Forbidden' });

  fs.unlinkSync(filePath);
  res.json({ message: 'File deleted', filename });
});

// Search files
app.get('/api/search', ensureAuth, (req, res) => {
  const query = (req.query.q || '').toLowerCase();
  const user = req.session.user || req.user;

  let files = [];

  // Public files
  const publicFiles = fs.readdirSync(path.join(UPLOAD_DIR, 'public')).filter(f => f.toLowerCase().includes(query))
    .map(f => {
      const stats = fs.statSync(path.join(UPLOAD_DIR, 'public', f));
      return { name: f, owner: 'Public', size: stats.size, mtime: stats.mtime, visibility: 'public' };
    });
  files.push(...publicFiles);

  // User private files
  const userDir = path.join(UPLOAD_DIR, user.username);
  if (fs.existsSync(userDir)) {
    const privateFiles = fs.readdirSync(userDir).filter(f => f.toLowerCase().includes(query))
      .map(f => {
        const stats = fs.statSync(path.join(userDir, f));
        return { name: f, owner: user.username, size: stats.size, mtime: stats.mtime, visibility: 'private' };
      });
    files.push(...privateFiles);
  }

  res.json(files);
});

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
