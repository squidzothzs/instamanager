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
// 1. WORKSPACE ROUTES
// ===============

// Create a new workspace (returns a unique ID)
app.post(['/workspace/create', '/_/backend/workspace/create'], async (req, res) => {
    try {
        const id = Math.random().toString(36).substring(2, 8);
        await kv.set(`ws:${id}`, JSON.stringify({ accounts: [] }));
        res.json({ workspace_id: id });
    } catch (err) {
        console.error("Workspace Create Error:", err.message);
        res.status(500).json({ error: "Failed to create workspace" });
    }
});

// Get workspace data (list of account IDs)
app.get(['/workspace/:id', '/_/backend/workspace/:id'], async (req, res) => {
    try {
        const raw = await kv.get(`ws:${req.params.id}`);
        if (!raw) return res.status(404).json({ error: "Workspace not found" });
        const workspace = typeof raw === 'string' ? JSON.parse(raw) : raw;
        res.json(workspace);
    } catch (err) {
        console.error("Workspace Get Error:", err.message);
        res.status(500).json({ error: "Failed to fetch workspace" });
    }
});

// ===============
// 2. OAUTH ROUTES
// ===============

// Generate Instagram OAuth URL — pass workspace_id as state so we get it back
app.get(['/auth/instagram', '/_/backend/auth/instagram'], (req, res) => {
    const workspaceId = req.query.workspace;
    const stringifiedParams = qs.stringify({
        client_id: process.env.INSTAGRAM_APP_ID,
        redirect_uri: process.env.INSTAGRAM_REDIRECT_URI,
        scope: 'instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments,instagram_business_content_publish,instagram_business_manage_insights',
        response_type: 'code',
        force_reauth: 'true',
        state: workspaceId || ''
    });

    const installUrl = `https://www.instagram.com/oauth/authorize?${stringifiedParams}`;
    res.json({ url: installUrl });
});

// Exchange code for token, then add the account to the workspace
app.post(['/auth/instagram/callback', '/_/backend/auth/instagram/callback'], async (req, res) => {
    const { code, workspace_id } = req.body;
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

        // Exchange for long-lived token
        const longTokenRes = await axios.get(`${IG_GRAPH_API}/access_token`, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: process.env.INSTAGRAM_APP_SECRET,
                access_token: accessToken
            }
        });
        accessToken = longTokenRes.data.access_token || accessToken;

        // Store the token for this user
        await kv.set(`token:${igUserId}`, accessToken);

        // Add the account to the workspace if workspace_id is provided
        if (workspace_id) {
            const raw = await kv.get(`ws:${workspace_id}`);
            const workspace = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { accounts: [] };
            
            // Don't add duplicate accounts
            if (!workspace.accounts.includes(igUserId.toString())) {
                workspace.accounts.push(igUserId.toString());
            }
            await kv.set(`ws:${workspace_id}`, JSON.stringify(workspace));
        }
        
        res.json({ success: true, user_id: igUserId });
    } catch (err) {
        console.error("OAuth Error:", err.response ? err.response.data : err.message);
        res.status(500).json({ error: "Failed to exchange token" });
    }
});

// ===============
// 3. DASHBOARD / DATA ROUTES
// ===============

// Get all accounts for a workspace
app.get(['/workspace/:id/accounts', '/_/backend/workspace/:id/accounts'], async (req, res) => {
    try {
        const raw = await kv.get(`ws:${req.params.id}`);
        if (!raw) return res.status(404).json({ error: "Workspace not found" });
        const workspace = typeof raw === 'string' ? JSON.parse(raw) : raw;

        const accounts = [];
        for (const userId of workspace.accounts) {
            try {
                const accessToken = await kv.get(`token:${userId}`);
                if (!accessToken) continue;

                const profileRes = await axios.get(`${IG_GRAPH_API}/${userId}`, {
                    params: {
                        access_token: accessToken,
                        fields: 'id,username,profile_picture_url,followers_count,media_count'
                    }
                });
                accounts.push(profileRes.data);
            } catch (profileErr) {
                console.error(`Failed to fetch profile for ${userId}:`, profileErr.response?.data || profileErr.message);
                // Still continue to fetch other accounts
            }
        }

        res.json({ accounts });
    } catch (err) {
        console.error("Workspace Accounts Error:", err.message);
        res.status(500).json({ error: "Failed to fetch workspace accounts" });
    }
});

// Remove an account from a workspace
app.delete(['/workspace/:id/accounts/:userId', '/_/backend/workspace/:id/accounts/:userId'], async (req, res) => {
    try {
        const raw = await kv.get(`ws:${req.params.id}`);
        if (!raw) return res.status(404).json({ error: "Workspace not found" });
        const workspace = typeof raw === 'string' ? JSON.parse(raw) : raw;

        workspace.accounts = workspace.accounts.filter(a => a !== req.params.userId);
        await kv.set(`ws:${req.params.id}`, JSON.stringify(workspace));

        res.json({ success: true });
    } catch (err) {
        console.error("Remove Account Error:", err.message);
        res.status(500).json({ error: "Failed to remove account" });
    }
});

// Post to specific accounts within a workspace
app.post(['/post', '/_/backend/post'], async (req, res) => {
    const { account_ids, caption, video_url } = req.body;
    if (!account_ids || account_ids.length === 0 || !video_url) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const results = [];
    let successCount = 0;

    for (const userId of account_ids) {
        try {
            const accessToken = await kv.get(`token:${userId}`);
            if (!accessToken) {
                results.push({ userId, error: "No token found" });
                continue;
            }

            const containerRes = await axios.post(`${IG_GRAPH_API}/${userId}/media`, null, {
                params: {
                    access_token: accessToken,
                    media_type: 'REELS',
                    video_url: video_url,
                    caption: caption
                }
            });

            const creationId = containerRes.data.id;

            const publishRes = await axios.post(`${IG_GRAPH_API}/${userId}/media_publish`, null, {
                params: {
                    creation_id: creationId,
                    access_token: accessToken
                }
            });

            if (publishRes.data.id) {
                successCount++;
                results.push({ userId, success: true });
            }
        } catch (err) {
            console.error(`Post Error for ${userId}:`, err.response?.data || err.message);
            results.push({ userId, error: err.response?.data || err.message });
        }
    }

    res.json({ success_count: successCount, total: account_ids.length, results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});
