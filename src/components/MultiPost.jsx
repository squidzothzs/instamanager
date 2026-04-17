import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Send, PlusCircle, Trash2, Film } from 'lucide-react';

function MultiPost() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [reelQueue, setReelQueue] = useState([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [isTrial, setIsTrial] = useState(false);
  const [status, setStatus] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const workspaceId = localStorage.getItem('workspace_id');
    if (workspaceId) {
      axios.get(`/_/backend/workspace/${workspaceId}/accounts`)
        .then(res => setAccounts(res.data.accounts || []))
        .catch(err => console.error(err));
    }
  }, []);

  const toggleAccount = (id) => {
    setSelectedAccounts(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  };

  const addReel = () => {
    if (!videoUrl.trim()) return alert('Enter a video URL first.');
    setReelQueue(prev => [...prev, { video_url: videoUrl.trim(), caption: caption.trim(), id: Date.now() }]);
    setVideoUrl('');
    setCaption('');
  };

  const removeReel = (id) => {
    setReelQueue(prev => prev.filter(r => r.id !== id));
  };

  const handlePost = async () => {
    if (selectedAccounts.length === 0) return alert('Select at least one account.');
    if (reelQueue.length === 0) return alert('Add at least one reel to the queue.');

    setLoading(true);
    setResults([]);
    const totalJobs = reelQueue.length * selectedAccounts.length;
    setStatus(`⏳ Processing ${reelQueue.length} reel(s) across ${selectedAccounts.length} account(s)… (${totalJobs} total posts, may take a few minutes)`);

    try {
      const res = await axios.post('/_/backend/post', {
        account_ids: selectedAccounts,
        reels: reelQueue.map(({ video_url, caption }) => ({ video_url, caption })),
        is_trial: isTrial
      }, { timeout: 600000 });

      setResults(res.data.results || []);
      if (res.data.success_count > 0) {
        setStatus(`✅ Published ${res.data.success_count}/${res.data.total} posts successfully.${isTrial ? ' (Trial Reels — shown to non-followers first)' : ''}`);
      } else {
        setStatus(`❌ All posts failed. Check the details below.`);
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ Request failed or timed out. Check Vercel logs.');
    }
    setLoading(false);
  };

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

  return (
    <div>
      <div className="page-header">
        <h2>Multi-Account Publisher</h2>
        <p>Queue multiple Reels and distribute them across all selected accounts simultaneously.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '40px' }}>

        {/* Left: Account Selection */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Select Accounts</h3>
          {accounts.length === 0
            ? <p className="text-muted">No accounts linked. Add accounts from Dashboard first.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {accounts.map(acc => (
                  <label key={acc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedAccounts.includes(acc.id)}
                      onChange={() => toggleAccount(acc.id)}
                      style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
                    />
                    <img src={acc.profile_picture_url || 'https://via.placeholder.com/40'} alt="pfp" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
                    <span>@{acc.username}</span>
                  </label>
                ))}
              </div>
            )}

          {/* Trial Reel Toggle */}
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={isTrial}
                onChange={e => setIsTrial(e.target.checked)}
                style={{ accentColor: 'var(--accent)', width: '18px', height: '18px' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Trial Reels</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Shown to non-followers first. Promote manually if it performs well.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Right: Reel Queue + Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Add Reel Form */}
          <div className="glass-panel" style={{ padding: '28px' }}>
            <h3 style={{ marginBottom: '20px', fontSize: '18px' }}>Add Reel to Queue</h3>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Video URL (public .mp4 link)</label>
              <input
                type="text"
                className="input-field"
                placeholder="https://example.com/my-video.mp4"
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addReel()}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Caption</label>
              <textarea
                className="input-field"
                placeholder="Write a caption… (optional)"
                rows="3"
                value={caption}
                onChange={e => setCaption(e.target.value)}
              />
            </div>

            <button
              className="primary-btn"
              onClick={addReel}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <PlusCircle size={18} />
              Add to Queue
            </button>
          </div>

          {/* Reel Queue List */}
          {reelQueue.length > 0 && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>
                Queue <span style={{ color: 'var(--accent)', fontWeight: 700 }}>({reelQueue.length})</span>
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {reelQueue.map((reel, i) => (
                  <div key={reel.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px' }}>
                    <Film size={18} style={{ flexShrink: 0, marginTop: '2px', color: 'var(--accent)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>Reel {i + 1}</div>
                      <div style={{ fontSize: '14px', wordBreak: 'break-all', marginBottom: reel.caption ? '6px' : 0 }}>{reel.video_url}</div>
                      {reel.caption && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{reel.caption}</div>}
                    </div>
                    <button onClick={() => removeReel(reel.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', flexShrink: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                className="primary-btn"
                onClick={handlePost}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', marginTop: '24px' }}
              >
                <Send size={18} />
                {loading
                  ? 'Publishing…'
                  : `Publish ${reelQueue.length} Reel${reelQueue.length > 1 ? 's' : ''} to ${selectedAccounts.length || 0} Account${selectedAccounts.length !== 1 ? 's' : ''}${isTrial ? ' (Trial)' : ''}`}
              </button>

              {status && (
                <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>
                  {status}
                </div>
              )}
            </div>
          )}

          {/* Results Breakdown */}
          {results.length > 0 && (
            <div className="glass-panel" style={{ padding: '28px' }}>
              <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Results</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {results.map((r, i) => {
                  const acc = accountMap[r.userId];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: r.success ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '8px', fontSize: '13px' }}>
                      <span>{r.success ? '✅' : '❌'}</span>
                      <span style={{ fontWeight: 600 }}>@{acc?.username || r.userId}</span>
                      <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.video_url}</span>
                      {r.error && <span style={{ color: '#f87171' }}>{r.error}</span>}
                      {r.success && r.is_trial && <span style={{ color: 'var(--accent)', fontSize: '11px' }}>TRIAL</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default MultiPost;
