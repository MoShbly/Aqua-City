# 🚀 Aqua City — Server Deployment Guide

## Common Production Issues & Fixes

---

### ❌ Problem: 3D Models not loading / rendering blank

**Cause:** `model-viewer` fetches `.glb` files as a cross-origin request. Browsers block
these unless the server sends the correct CORS headers on the `/uploads` route.

**Fix:** Already applied in `server/index.js` — the `/uploads` route now sends:
```
Access-Control-Allow-Origin: *
Cross-Origin-Resource-Policy: cross-origin
```

---

### ❌ Problem: File uploads fail (models / images)

**Cause A — Nginx body size limit (most common)**

Nginx defaults to a **1MB upload limit**. Your 3D models are much larger.

**Fix:** Add this to your nginx server block:

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;

    # Allow large file uploads (set to 210MB to cover 200MB model limit)
    client_max_body_size 210M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Increase timeouts for large uploads
        proxy_read_timeout    300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout    300s;
    }
}
```

**Cause B — Apache body size limit**

If using Apache, add to your `.htaccess` or VirtualHost config:
```apache
LimitRequestBody 220200960
```

---

### ❌ Problem: QR codes point to wrong URL (localhost instead of server IP)

**Cause:** The QR code is generated using `req.protocol + req.get('host')`. If nginx is
proxying without forwarding the original host header, the server sees `localhost:3000`.

**Fix:** Make sure your nginx config includes these proxy headers (shown above):
```nginx
proxy_set_header   Host $host;
proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto $scheme;
```

And trust the proxy in Express. Add this line to `server/index.js` right after `const app = express();`:
```js
app.set('trust proxy', 1);
```

---

### ❌ Problem: Server crashes or database errors on startup

**Cause:** `sql.js` uses WebAssembly. On some Linux servers, the WASM binary may not
resolve correctly if `node_modules` is incomplete.

**Fix:** Re-install dependencies on the server:
```bash
cd server
rm -rf node_modules
npm install
npm start
```

---

## Full Deployment Steps

```bash
# 1. Upload the shibli/ folder to your server (e.g. via SCP or Git)
scp -r shibli/ user@your-server:/var/www/aquacity

# 2. SSH into your server
ssh user@your-server

# 3. Install Node.js (if not installed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# 4. Install dependencies
cd /var/www/aquacity/server
npm install

# 5. Start the server (basic)
npm start

# 6. Or run as a persistent service with PM2
npm install -g pm2
pm2 start index.js --name aquacity
pm2 save
pm2 startup
```

---

## Environment Variables

Edit `server/.env`:
```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
```

If you want to run on port 80 directly (without nginx), change `PORT=80` and run with `sudo`.

---

## Health Check

Visit `http://YOUR_SERVER_IP:3000/api/health` — you should see:
```json
{ "status": "ok", "timestamp": "...", "version": "1.0.0" }
```

If this works but models don't load, the issue is CORS (already fixed).
If this doesn't work, the server isn't running — check `pm2 logs aquacity`.
