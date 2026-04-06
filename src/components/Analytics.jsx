import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Eye, Heart, MessageCircle, Share2, Bookmark, Play, Users, Image, TrendingUp, Film, BarChart2, RefreshCw } from 'lucide-react';

function StatCard({ icon: Icon, label, value }) {
  const display = value === undefined || value === null ? '—' : Number(value).toLocaleString();
  return (
    <div className="stat-card glass-panel animate-slide-in">
      <div className="stat-card-icon">
        <Icon size={20} />
      </div>
      <div>
        <div className="stat-card-value">{display}</div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  );
}

function MediaTypeIcon({ type }) {
  if (type === 'VIDEO') return <Film size={12} />;
  if (type === 'CAROUSEL_ALBUM') return <Image size={12} />;
  return <Image size={12} />;
}

function getTypeLabel(productType, mediaType) {
  if (productType === 'REELS') return 'Reel';
  if (mediaType === 'CAROUSEL_ALBUM') return 'Carousel';
  if (mediaType === 'VIDEO') return 'Video';
  return 'Photo';
}

function PostCard({ post }) {
  const m = post.metrics;
  const date = new Date(post.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const isReel = post.media_product_type === 'REELS';
  const typeLabel = getTypeLabel(post.media_product_type, post.media_type);

  return (
    <a href={post.permalink} target="_blank" rel="noopener noreferrer"
       className="reel-card glass-panel"
       style={post.metricsAvailable === false ? { opacity: 0.55 } : {}}>
      <div className="reel-thumb">
        {post.thumbnail_url
          ? <img src={post.thumbnail_url} alt="Post thumbnail" />
          : <div className="reel-thumb-placeholder"><Image size={32} color="var(--text-muted)" /></div>
        }
        <div className="media-type-badge">
          <MediaTypeIcon type={post.media_type} />
          {typeLabel}
        </div>
        {isReel && m.plays != null && (
          <div className="reel-plays">
            <Play size={11} fill="white" />
            {Number(m.plays || 0).toLocaleString()}
          </div>
        )}
      </div>
      <div className="reel-info">
        {post.metricsAvailable === false && (
          <p style={{ fontSize: '11px', color: '#ff9900', marginBottom: '4px' }}>⚠️ No insights (pre-business account)</p>
        )}
        <p className="reel-caption">
          {post.caption ? post.caption.slice(0, 80) + (post.caption.length > 80 ? '…' : '') : 'No caption'}
        </p>
        <div className="reel-metrics">
          {m.impressions != null && <span title="Impressions"><Eye size={12} /> {Number(m.impressions || 0).toLocaleString()}</span>}
          {m.reach != null && <span title="Reach"><TrendingUp size={12} /> {Number(m.reach || 0).toLocaleString()}</span>}
          <span title="Likes"><Heart size={12} /> {Number(m.likes || 0).toLocaleString()}</span>
          <span title="Comments"><MessageCircle size={12} /> {Number(m.comments || 0).toLocaleString()}</span>
          {m.shares != null && <span title="Shares"><Share2 size={12} /> {Number(m.shares || 0).toLocaleString()}</span>}
          {m.saved != null && <span title="Saved"><Bookmark size={12} /> {Number(m.saved || 0).toLocaleString()}</span>}
        </div>
        <span className="reel-date">{date}</span>
      </div>
    </a>
  );
}

function Analytics() {
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAccount, setActiveAccount] = useState(0);

  const loadAnalytics = () => {
    const workspaceId = localStorage.getItem('workspace_id');
    if (!workspaceId) {
      setError('No workspace found. Go to Dashboard first.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    axios.get(`/_/backend/workspace/${workspaceId}/analytics`)
      .then(res => {
        setAnalytics(res.data.analytics || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load analytics. ' + (err.response?.data?.error || err.message));
        setLoading(false);
      });
  };

  useEffect(() => { loadAnalytics(); }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 0', gap: '16px' }}>
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-muted)' }}>Fetching analytics — this may take a moment…</p>
    </div>
  );

  if (error) return (
    <div className="page-header">
      <p style={{ color: 'var(--accent)' }}>{error}</p>
      <button className="secondary-btn" style={{ marginTop: '16px' }} onClick={loadAnalytics}>Try Again</button>
    </div>
  );

  if (analytics.length === 0) return (
    <div className="page-header">
      <p>No linked accounts found. Add accounts from the Dashboard first.</p>
    </div>
  );

  const current = analytics[activeAccount];
  const ins = current.insights || {};
  const profile = current.profile;

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Analytics</h2>
          <p>Performance overview for your linked Instagram accounts.</p>
        </div>
        <button className="secondary-btn" onClick={loadAnalytics} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Account Tabs */}
      {analytics.length > 1 && (
        <div className="account-tabs">
          {analytics.map((a, i) => (
            <button
              key={a.profile.id}
              className={`account-tab ${i === activeAccount ? 'active' : ''}`}
              onClick={() => setActiveAccount(i)}
            >
              <img src={a.profile.profile_picture_url || 'https://via.placeholder.com/28'} alt="pfp" />
              @{a.profile.username}
            </button>
          ))}
        </div>
      )}

      {/* Account Header */}
      <div className="analytics-header glass-panel">
        <img src={profile.profile_picture_url || 'https://via.placeholder.com/64'} alt="pfp" className="analytics-avatar" />
        <div>
          <h3 style={{ fontSize: '20px', fontWeight: 700 }}>@{profile.username}</h3>
          {profile.biography && <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', maxWidth: '480px' }}>{profile.biography}</p>}
          <p style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '6px' }}>Last 28 days overview</p>
        </div>
      </div>

      {/* Account Stats */}
      <div className="stats-grid">
        <StatCard icon={Users} label="Followers" value={profile.followers_count} />
        <StatCard icon={Image} label="Total Posts" value={profile.media_count} />
        <StatCard icon={Eye} label="Reach (28d)" value={ins.reach} />
        <StatCard icon={BarChart2} label="Views (28d)" value={ins.views} />
        <StatCard icon={TrendingUp} label="Profile Views (28d)" value={ins.profile_views} />
        <StatCard icon={Users} label="New Followers (28d)" value={ins.follower_count} />
        <StatCard icon={Heart} label="Interactions (28d)" value={ins.total_interactions} />
        <StatCard icon={Eye} label="Engaged Accounts (28d)" value={ins.accounts_engaged} />
      </div>

      {/* No insights warning */}
      {Object.keys(ins).length === 0 && (
        <div style={{ padding: '16px', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: '8px', margin: '16px 0', fontSize: '13px', color: '#ffcc00' }}>
          ⚠️ Account-level insights unavailable. This can happen if the account was recently added or if your Meta App doesn't have <code>instagram_business_manage_insights</code> approved. Individual post metrics below may still work.
        </div>
      )}

      {/* Posts/Reels Grid */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
          Recent Posts & Reels
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '10px' }}>
            ({current.posts?.length || 0} posts)
          </span>
        </h3>
        {(!current.posts || current.posts.length === 0) ? (
          <div className="glass-panel empty-state">
            <Play size={40} color="var(--text-muted)" />
            <h3>No posts found</h3>
            <p>Post content to your Instagram account to see performance data here.</p>
          </div>
        ) : (
          <div className="reels-grid">
            {current.posts.map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Analytics;
