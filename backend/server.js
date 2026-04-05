const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const qs = require('querystring');
const path = require('path');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("DB Connection Error:", err);
});

// Using Instagram internal user ids now
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instagram_user_id TEXT UNIQUE,
        access_token TEXT,
        username TEXT
    )`);
});

const IG_GRAPH_API = 'https://graph.instagram.com/v21.0';

// ===============
// 1. OAUTH ROUTES
// ===============

app.get('/api/auth/instagram', (req, res) => {
    const stringifiedParams = qs.stringify({
        client_id: process.env.INSTAGRAM_APP_ID,
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        scope: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights',
        response_type: 'code',
        force_reauth: 'true'
    });

    const installUrl = `https://www.instagram.com/oauth/authorize?${stringifiedParams}`;
    res.json({ url: installUrl });
});

// Since the user is redirecting to their Vercel frontend, we expose an endpoint 
// for the frontend to hit with the code they extracted from the URL.
app.post('/api/auth/instagram/callback', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).send('No code provided');

    try {
        // Form Data is specifically required for IG Token Exchange
        const formData = new URLSearchParams();
        formData.append('client_id', process.env.INSTAGRAM_APP_ID);
        formData.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI);
        formData.append('code', code);

        const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        // This returns short-lived token and the user's ID
        let accessToken = tokenResponse.data.access_token;
        const igUserId = tokenResponse.data.user_id;

        // Exchange for long-lived token
        const longTokenRes = await axios.get(`${IG_GRAPH_API}/access_token`, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: process.env.INSTAGRAM_APP_SECRET,
                access_token: accessToken
            }
        });
        accessToken = longTokenRes.data.access_token || accessToken;

        // Save to DB
        db.run(
            `INSERT INTO users (instagram_user_id, access_token) VALUES (?, ?)
             ON CONFLICT(instagram_user_id) DO UPDATE SET access_token=excluded.access_token`,
            [igUserId, accessToken],
            function(err) {
                if (err) return res.status(500).json({ error: 'DB Error' });
                res.json({ success: true, user_id: igUserId });
            }
        );

    } catch (err) {
        console.error("OAuth Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "Failed to exchange token" });
    }
});


// ===============
// 2. DASHBOARD / DATA ROUTES
// ===============

app.get('/api/accounts', (req, res) => {
    const userId = req.query.user_id;

    db.get(`SELECT access_token FROM users WHERE instagram_user_id = ?`, [userId], async (err, row) => {
        if (err || !row) return res.status(401).json({ error: "Unauthenticated" });
        
        try {
            // Get profile details directly from IG Graph
            const profileRes = await axios.get(`${IG_GRAPH_API}/${userId}`, {
                params: {
                    access_token: row.access_token,
                    fields: 'id,username,profile_picture_url,followers_count,media_count'
                }
            });
            
            // Since this API only authenticates the single requested IG account, we just return it as a list of 1.
            res.json({ accounts: [profileRes.data] });
        } catch (error) {
            console.error("Profile Error:", error.response ? error.response.data : error.message);
            res.status(500).json({ error: "Failed to fetch profile" });
        }
    });
});

app.post('/api/post', async (req, res) => {
    const { user_id, account_ids, caption, video_url } = req.body;

    if (!user_id || !video_url) return res.status(400).json({ error: "Missing parameters" });

    db.get(`SELECT access_token FROM users WHERE instagram_user_id = ?`, [user_id], async (err, row) => {
        if (err || !row) return res.status(401).json({ error: "Unauthenticated" });
        
        const accessToken = row.access_token;

        try {
            // 1. Upload Video Container
            const containerRes = await axios.post(`${IG_GRAPH_API}/${user_id}/media`, null, {
                params: {
                    access_token: accessToken,
                    media_type: 'REELS',
                    video_url: video_url,
                    caption: caption
                }
            });

            const creationId = containerRes.data.id;
            
            // Note: For production large videos, you must poll. We'll attempt immediate publish.
            const publishRes = await axios.post(`${IG_GRAPH_API}/${user_id}/media_publish`, null, {
                params: {
                    creation_id: creationId,
                    access_token: accessToken
                }
            });
            
            if (publishRes.data.id) {
                res.json({ success_count: 1, total: 1, errors: [] });
            } else {
                res.status(500).json({ error: "Publish failed" });
            }
        } catch (err) {
            console.error("Post Error:", err.response ? err.response.data : err.message);
            res.status(500).json({ error: "API submission error", details: err.response?.data });
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 IG API Backend running on http://localhost:${PORT}`);
});
