import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart2, Eye, Heart, MessageCircle, Share2, Bookmark, Play, Users, Image, TrendingUp } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="stat-card glass-panel">
      <div className="stat-card-icon" style={{ background: color || 'rgba(255,0,85,0.1)', color: color ? 'white' : 'var(--accent)' }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="stat-card-value">{typeof value === 'number' ? value.toLocaleString() : (value || '—')}</div>
        <div className="stat-card-label">{label}</div>
      </div>
    </div>
  );
}

function ReelCard({ reel }) {
  const m = reel.metrics;
  const date = new Date(reel.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <a href={reel.permalink} target="_blank" rel="noopener noreferrer" className="reel-card glass-panel">
      <div className="reel-thumb">
        {reel.thumbnail_url
          ? <img src={reel.thumbnail_url} alt="Reel thumbnail" />
          : <div className="reel-thumb-placeholder"><Play size={32} /></div>
        }
        <div className="reel-plays">
          <Play size={12} />
          {(m.plays || 0).toLocaleString()}
        </div>
      </div>
      <div className="reel-info">
        <p className="reel-caption">{reel.caption ? reel.caption.slice(0, 80) + (reel.caption.length > 80 ? '…' : '') : 'No caption'}</p>
        <div className="reel-metrics">
          <span><Heart size={12} /> {(m.likes || 0).toLocaleString()}</span>
          <span><MessageCircle size={12} /> {(m.comments || 0).toLocaleString()}</span>
          <span><Share2 size={12} /> {(m.shares || 0).toLocaleString()}</span>
          <span><Bookmark size={12} /> {(m.saved || 0).toLocaleString()}</span>
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

  useEffect(() => {
    const workspaceId = localStorage.getItem('workspace_id');
    if (!workspaceId) {
      setError('No workspace found. Go to Dashboard first.');
      setLoading(false);
      return;
    }

    axios.get(`/_/backend/workspace/${workspaceId}/analytics`)
      .then(res => {
        setAnalytics(res.data.analytics || []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Failed to load analytics. ' + (err.response?.data?.error || ''));
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="page-header">
      <p>Fetching analytics — this may take a moment…</p>
      <div className="spinner" style={{ marginTop: '24px' }}></div>
    </div>
  );

  if (error) return <div className="page-header"><p style={{ color: 'var(--accent)' }}>{error}</p></div>;

  if (analytics.length === 0) return (
    <div className="page-header">
      <p>No linked accounts found. Add accounts from the Dashboard first.</p>
    </div>
  );

  const current = analytics[activeAccount];
  const ins = current.insights;
  const profile = current.profile;

  return (
    <div>
      <div className="page-header">
        <h2>Analytics</h2>
        <p>Performance overview for your linked Instagram accounts.</p>
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
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>Last 30 days overview</p>
        </div>
      </div>

      {/* Account Stats */}
      <div className="stats-grid">
        <StatCard icon={Users} label="Followers" value={profile.followers_count} />
        <StatCard icon={Image} label="Total Posts" value={profile.media_count} />
        <StatCard icon={Eye} label="Reach (30d)" value={ins.reach} />
        <StatCard icon={TrendingUp} label="Impressions (30d)" value={ins.impressions} />
        <StatCard icon={BarChart2} label="Profile Views (30d)" value={ins.profile_views} />
      </div>

      {/* Reels Performance */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>
          Recent Reels Performance
        </h3>
        {current.reels.length === 0 ? (
          <div className="glass-panel empty-state">
            <Play size={40} color="var(--text-muted)" />
            <h3>No Reels found</h3>
            <p>Post your first Reel to see performance data here.</p>
          </div>
        ) : (
          <div className="reels-grid">
            {current.reels.map(reel => (
              <ReelCard key={reel.id} reel={reel} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Analytics;
