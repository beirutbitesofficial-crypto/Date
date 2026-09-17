const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: 'index.html'
}));

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Hostinger Node.js hosting expects the app to call listen() immediately.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Taha × Shaimaa Date app running on port ${PORT}`);
});
