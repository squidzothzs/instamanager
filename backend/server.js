const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('querystring');
const { kv } = require('@vercel/kv'); 
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const IG_GRAPH_API = 'https://graph.instagram.com/v21.0';

// ===============
// 1. OAUTH ROUTES
// ===============

app.get('/_/backend/auth/instagram', (req, res) => {
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

app.post('/_/backend/auth/instagram/callback', async (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).send('No code provided');

    try {
        const formData = new URLSearchParams();
        formData.append('client_id', process.env.INSTAGRAM_APP_ID);
        formData.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
        formData.append('grant_type', 'authorization_code');
        formData.append('redirect_uri', process.env.INSTAGRAM_REDIRECT_URI);
        formData.append('code', code);

        const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        let accessToken = tokenResponse.data.access_token;
        const igUserId = tokenResponse.data.user_id;

        const longTokenRes = await axios.get(`${IG_GRAPH_API}/access_token`, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: process.env.INSTAGRAM_APP_SECRET,
                access_token: accessToken
            }
        });
        accessToken = longTokenRes.data.access_token || accessToken;

        await kv.set(igUserId.toString(), accessToken);
        
        res.json({ success: true, user_id: igUserId });
    } catch (err) {
        console.error("OAuth Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "Failed to exchange token" });
    }
});

// ===============
// 2. DASHBOARD / DATA ROUTES
// ===============

app.get('/_/backend/accounts', async (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: "Missing user_id parameter" });

    try {
        const accessToken = await kv.get(userId.toString());
        if (!accessToken) return res.status(401).json({ error: "Unauthenticated" });

        const profileRes = await axios.get(`${IG_GRAPH_API}/${userId}`, {
            params: {
                access_token: accessToken,
                fields: 'id,username,profile_picture_url,followers_count,media_count'
            }
        });
        
        res.json({ accounts: [profileRes.data] });
    } catch (error) {
        console.error("Profile Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

app.post('/_/backend/post', async (req, res) => {
    const { user_id, account_ids, caption, video_url } = req.body;
    if (!user_id || !video_url) return res.status(400).json({ error: "Missing parameters" });

    try {
        const accessToken = await kv.get(user_id.toString());
        if (!accessToken) return res.status(401).json({ error: "Unauthenticated" });

        const containerRes = await axios.post(`${IG_GRAPH_API}/${user_id}/media`, null, {
            params: {
                access_token: accessToken,
                media_type: 'REELS',
                video_url: video_url,
                caption: caption
            }
        });

        const creationId = containerRes.data.id;
        
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});
