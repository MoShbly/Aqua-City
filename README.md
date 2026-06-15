# 🌊 Aqua City — Backend API + Admin Panel

Interactive animal exhibit system with QR codes and 3D model support.

## Quick Start

```bash
cd server
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## Project Structure

```
shibli/
├── server/              ← Node.js + Express API
│   ├── index.js         ← Entry point
│   ├── routes/
│   │   ├── animals.js   ← CRUD + file upload
│   │   └── stats.js     ← Dashboard stats
│   ├── db/
│   │   └── database.js  ← SQLite setup
│   └── uploads/
│       ├── models/      ← 3D model files (.glb etc)
│       ├── images/      ← Animal photos
│       └── qrcodes/     ← Auto-generated QR PNGs
├── admin/               ← Web admin panel (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
└── data/
    └── aquacity.db      ← SQLite database (auto-created)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET    | /api/animals | List all animals |
| GET    | /api/animals/:id | Get animal (logs scan) |
| POST   | /api/animals | Create animal |
| PATCH  | /api/animals/:id | Update animal |
| PATCH  | /api/animals/:id/model | Upload 3D model |
| DELETE | /api/animals/:id | Delete animal |
| POST   | /api/animals/:id/regenerate-qr | New QR code |
| GET    | /api/stats | Dashboard stats |
| GET    | /api/health | Health check |

## Unity Integration

When a QR code is scanned, it contains the URL:
```
http://YOUR_SERVER_IP:3000/api/animals/ANIMAL_ID
```

Call this endpoint from Unity to get:
- Animal info (name, description, habitat, etc.)
- `model_url` → direct URL to download the `.glb` 3D model
- `image_url` → animal photo
- Fun facts, conservation status, etc.

## Deploy to Your Server

1. Copy the `shibli/` folder to your server
2. Install Node.js on the server
3. Run `cd server && npm install && npm start`
4. Open firewall port 3000 (or use nginx reverse proxy on port 80)
5. Update `.env` with your server's IP if needed
# Aqua-City
