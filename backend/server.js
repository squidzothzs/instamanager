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

        // Exchange for long-lived token first
        const longTokenRes = await axios.get(`${IG_GRAPH_API}/access_token`, {
            params: {
                grant_type: 'ig_exchange_token',
                client_secret: process.env.INSTAGRAM_APP_SECRET,
                access_token: accessToken
            }
        });
        accessToken = longTokenRes.data.access_token || accessToken;

        // Get the REAL user ID as a string from /me — avoids JS floating point precision
        // loss that occurs when token exchange returns user_id as a large JSON number
        const meRes = await axios.get(`${IG_GRAPH_API}/me`, {
            params: {
                access_token: accessToken,
                fields: 'id,username'
            }
        });
        const igUserId = meRes.data.id; // Always returned as string by Graph API

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

// Analytics — account insights + all recent media metrics
app.get(['/workspace/:id/analytics', '/_/backend/workspace/:id/analytics'], async (req, res) => {
    try {
        const raw = await kv.get(`ws:${req.params.id}`);
        if (!raw) return res.status(404).json({ error: "Workspace not found" });
        const workspace = typeof raw === 'string' ? JSON.parse(raw) : raw;

        const analyticsData = [];

        for (const userId of workspace.accounts) {
            try {
                const accessToken = await kv.get(`token:${userId}`);
                if (!accessToken) { console.log(`No token for ${userId}`); continue; }

                // Fetch basic profile
                const profileRes = await axios.get(`${IG_GRAPH_API}/${userId}`, {
                    params: {
                        access_token: accessToken,
                        fields: 'id,username,profile_picture_url,followers_count,media_count,biography,website'
                    }
                });

                // Fetch account-level insights (28 days)
                // Valid v21 metrics: reach, follower_count, website_clicks, profile_views,
                // accounts_engaged, total_interactions, views (NOT impressions)
                const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const until = new Date().toISOString().split('T')[0];

                let accountInsights = {};
                try {
                    const insightsRes = await axios.get(`${IG_GRAPH_API}/${userId}/insights`, {
                        params: {
                            access_token: accessToken,
                            metric: 'reach,views,profile_views,follower_count,accounts_engaged,total_interactions',
                            period: 'day',
                            since: since,
                            until: until
                        }
                    });

                    for (const metric of (insightsRes.data.data || [])) {
                        const total = (metric.values || []).reduce((sum, v) => sum + (Number(v.value) || 0), 0);
                        accountInsights[metric.name] = total;
                    }
                    console.log(`Account insights for ${userId}:`, accountInsights);
                } catch (insightErr) {
                    console.error(`Insights error for ${userId}:`, JSON.stringify(insightErr.response?.data || insightErr.message));
                }

                // Fetch all recent media — include media_product_type to detect Reels vs regular
                const mediaRes = await axios.get(`${IG_GRAPH_API}/${userId}/media`, {
                    params: {
                        access_token: accessToken,
                        fields: 'id,media_type,media_product_type,thumbnail_url,media_url,caption,timestamp,permalink,like_count,comments_count',
                        limit: 24
                    }
                });

                const posts = [];
                for (const media of (mediaRes.data.data || [])) {
                    const productType = media.media_product_type || 'POST'; // REELS, POST, STORY, AD
                    const isReel = productType === 'REELS';
                    const isVideo = media.media_type === 'VIDEO';

                    // Metric support matrix (confirmed from Instagram API docs v21):
                    // REELS:          reach, plays, likes, comments, shares, saved, total_interactions
                    // Regular VIDEO:  reach, likes, comments, shares, saved, total_interactions
                    // IMAGE/CAROUSEL: reach, impressions, likes, comments, shares, saved, total_interactions
                    let metricList;
                    if (isReel) {
                        metricList = 'reach,plays,likes,comments,shares,saved,total_interactions';
                    } else if (isVideo) {
                        metricList = 'reach,likes,comments,shares,saved,total_interactions';
                    } else {
                        metricList = 'reach,impressions,likes,comments,shares,saved,total_interactions';
                    }

                    let metrics = {};
                    let metricsAvailable = true;
                    try {
                        const mediaInsightsRes = await axios.get(`${IG_GRAPH_API}/${media.id}/insights`, {
                            params: { access_token: accessToken, metric: metricList }
                        });

                        for (const m of (mediaInsightsRes.data.data || [])) {
                            metrics[m.name] = m.value ?? m.values?.[0]?.value ?? 0;
                        }
                    } catch (mErr) {
                        const errCode = mErr.response?.data?.error?.error_subcode;
                        // 2108006 = posted before business account conversion — no insights available
                        if (errCode === 2108006) {
                            metricsAvailable = false;
                        } else {
                            console.error(`Media insights error for ${media.id}:`, JSON.stringify(mErr.response?.data || mErr.message));
                        }
                        // Fallback to basic counts from media object
                        metrics = {
                            likes: media.like_count || 0,
                            comments: media.comments_count || 0
                        };
                    }

                    posts.push({
                        id: media.id,
                        media_type: media.media_type,
                        media_product_type: productType,
                        thumbnail_url: media.thumbnail_url || media.media_url,
                        caption: media.caption || '',
                        timestamp: media.timestamp,
                        permalink: media.permalink,
                        metrics,
                        metricsAvailable
                    });
                }

                analyticsData.push({
                    profile: profileRes.data,
                    insights: accountInsights,
                    posts
                });

            } catch (err) {
                console.error(`Analytics error for ${userId}:`, JSON.stringify(err.response?.data || err.message));
            }
        }

        res.json({ analytics: analyticsData });
    } catch (err) {
        console.error("Analytics Route Error:", err.message);
        res.status(500).json({ error: "Failed to fetch analytics" });
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
// Accepts either:
//   { account_ids, video_url, caption, is_trial }          — single reel (legacy)
//   { account_ids, reels: [{video_url, caption}], is_trial } — multiple reels (new)
app.post(['/post', '/_/backend/post'], async (req, res) => {
    const { account_ids, is_trial } = req.body;

    // Normalise to array of reels regardless of which shape was sent
    let reels = [];
    if (req.body.reels && Array.isArray(req.body.reels)) {
        reels = req.body.reels;
    } else if (req.body.video_url) {
        reels = [{ video_url: req.body.video_url, caption: req.body.caption || '' }];
    }

    if (!account_ids || account_ids.length === 0 || reels.length === 0) {
        return res.status(400).json({ error: "Missing parameters" });
    }

    const results = [];
    let successCount = 0;
    let totalAttempts = 0;

    for (const reel of reels) {
        const { video_url, caption } = reel;

        for (const userId of account_ids) {
            totalAttempts++;
            try {
                const accessToken = await kv.get(`token:${userId}`);
                if (!accessToken) {
                    results.push({ userId, video_url, error: "No token found" });
                    continue;
                }

                // Step 1: Create the media container
                const containerParams = {
                    access_token: accessToken,
                    media_type: 'REELS',
                    video_url,
                    caption
                };
                // Trial reels are shown to non-followers first before deciding to promote
                // graduation_strategy: MANUAL = promote via app, SS_PERFORMANCE = auto-promote if strong
                if (is_trial) containerParams.trial_params = JSON.stringify({ graduation_strategy: 'MANUAL' });

                const containerRes = await axios.post(`${IG_GRAPH_API}/${userId}/media`, null, {
                    params: containerParams
                });

                const creationId = containerRes.data.id;

                // Step 2: Poll until Instagram finishes processing the video (max 2 minutes)
                let mediaStatus = 'IN_PROGRESS';
                let attempts = 0;
                const maxAttempts = 24; // 24 x 5s = 2 minutes

                while (mediaStatus !== 'FINISHED' && attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    const statusRes = await axios.get(`${IG_GRAPH_API}/${creationId}`, {
                        params: { access_token: accessToken, fields: 'status_code,status' }
                    });
                    mediaStatus = statusRes.data.status_code;
                    console.log(`[${userId}] Reel (${video_url}) status attempt ${attempts + 1}: ${mediaStatus}`);

                    if (mediaStatus === 'ERROR') {
                        throw new Error(`Instagram rejected the video: ${JSON.stringify(statusRes.data.status)}`);
                    }
                    attempts++;
                }

                if (mediaStatus !== 'FINISHED') {
                    throw new Error('Video processing timed out after 2 minutes.');
                }

                // Step 3: Publish
                const publishRes = await axios.post(`${IG_GRAPH_API}/${userId}/media_publish`, null, {
                    params: { creation_id: creationId, access_token: accessToken }
                });

                if (publishRes.data.id) {
                    successCount++;
                    results.push({ userId, video_url, success: true, post_id: publishRes.data.id, is_trial: !!is_trial });
                }
            } catch (err) {
                console.error(`Post Error for ${userId} / ${video_url}:`, err.response?.data || err.message);
                results.push({ userId, video_url, error: err.response?.data?.error?.message || err.message });
            }
        }
    }

    res.json({ success_count: successCount, total: totalAttempts, results });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Backend running on port ${PORT}`);
});
