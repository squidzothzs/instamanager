import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Send, Image as ImageIcon } from 'lucide-react';

function MultiPost() {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [caption, setCaption] = useState('');
  const [videoUrl, setVideoUrl] = useState(''); // Use URL for demo simplicity
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const userId = localStorage.getItem('ig_user_id');
    if (userId) {
      axios.get(`/api/accounts?user_id=${userId}`)
        .then(res => setAccounts(res.data.accounts || []))
        .catch(err => console.error(err));
    }
  }, []);

  const toggleAccount = (id) => {
    if (selectedAccounts.includes(id)) {
      setSelectedAccounts(selectedAccounts.filter(a => a !== id));
    } else {
      setSelectedAccounts([...selectedAccounts, id]);
    }
  };

  const handlePost = async () => {
    if (selectedAccounts.length === 0) return alert('Select at least one account!');
    if (!videoUrl || !caption) return alert('Enter a video URL and caption!');
    
    setLoading(true);
    setStatus('Publishing to selected accounts...');
    
    try {
      const userId = localStorage.getItem('fb_user_id');
      const payload = {
        user_id: userId,
        account_ids: selectedAccounts,
        caption: caption,
        video_url: videoUrl
      };

      const res = await axios.post('/api/post', payload);
      setStatus(`Success! Published to ${res.data.success_count} accounts.`);
    } catch (err) {
      console.error(err);
      setStatus('Failed to publish post. Check backend logs.');
    }
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Multi-Account Publisher</h2>
        <p>Distribute a single post to multiple Instagram accounts simultaneously.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '40px' }}>
        
        {/* Left Col: Account Selection */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '18px' }}>Select Accounts</h3>
          {accounts.length === 0 ? <p className="text-muted">No accounts available.</p> : (
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
        </div>

        {/* Right Col: Post Form */}
        <div className="glass-panel" style={{ padding: '32px' }}>
          <h3 style={{ marginBottom: '24px', fontSize: '18px' }}>Create Post</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Video URL (Reels require public link)</label>
            <input 
              type="text" 
              className="input-field" 
              placeholder="https://example.com/my-video.mp4"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '32px' }}>
            <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-muted)' }}>Caption</label>
            <textarea 
              className="input-field" 
              placeholder="Write an engaging caption..."
              rows="5"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
          </div>

          <button className="primary-btn" onClick={handlePost} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center' }}>
            <Send size={18} />
            {loading ? 'Publishing...' : 'Publish to Selected Accounts'}
          </button>

          {status && <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }}>{status}</div>}
        </div>
      </div>
    </div>
  );
}

export default MultiPost;
