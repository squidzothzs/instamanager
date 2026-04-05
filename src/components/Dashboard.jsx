import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Users } from 'lucide-react';

function Dashboard() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [isNewWorkspace, setIsNewWorkspace] = useState(false);

  useEffect(() => {
    initWorkspace();
  }, []);

  const initWorkspace = async () => {
    // Check URL params first, then localStorage
    const params = new URLSearchParams(window.location.search);
    let wsId = params.get('workspace') || localStorage.getItem('workspace_id');

    if (!wsId) {
      // Create a brand new workspace
      try {
        const res = await axios.post('/_/backend/workspace/create');
        wsId = res.data.workspace_id;
        localStorage.setItem('workspace_id', wsId);
        // Update the URL without reload
        window.history.replaceState({}, '', `/?workspace=${wsId}`);
        setIsNewWorkspace(true);
      } catch (err) {
        console.error(err);
        setError("Failed to create workspace.");
        setLoading(false);
        return;
      }
    } else {
      localStorage.setItem('workspace_id', wsId);
      // Ensure workspace param is in URL
      if (!params.get('workspace')) {
        window.history.replaceState({}, '', `/?workspace=${wsId}`);
      }
    }

    setWorkspaceId(wsId);
    await fetchAccounts(wsId);
  };

  const fetchAccounts = async (wsId) => {
    try {
      const res = await axios.get(`/_/backend/workspace/${wsId}/accounts`);
      setAccounts(res.data.accounts || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) {
        // Workspace doesn't exist, create a new one
        try {
          const createRes = await axios.post('/_/backend/workspace/create');
          const newId = createRes.data.workspace_id;
          localStorage.setItem('workspace_id', newId);
          window.history.replaceState({}, '', `/?workspace=${newId}`);
          setWorkspaceId(newId);
          setIsNewWorkspace(true);
          setAccounts([]);
        } catch (createErr) {
          setError("Failed to initialize workspace.");
        }
      } else {
        setError("Could not fetch accounts.");
      }
      setLoading(false);
    }
  };

  const handleAddAccount = async () => {
    try {
      const response = await fetch(`/_/backend/auth/instagram?workspace=${workspaceId}`);
      const data = await response.json();
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      alert('Failed to connect to backend.');
    }
  };

  const handleRemoveAccount = async (userId) => {
    if (!confirm('Remove this account from your workspace?')) return;
    try {
      await axios.delete(`/_/backend/workspace/${workspaceId}/accounts/${userId}`);
      setAccounts(accounts.filter(a => a.id !== userId));
    } catch (err) {
      console.error(err);
      alert('Failed to remove account.');
    }
  };

  const copyWorkspaceLink = () => {
    const link = `${window.location.origin}/?workspace=${workspaceId}`;
    navigator.clipboard.writeText(link);
    alert('Workspace link copied! Open this on any device to access your accounts.');
  };

  if (loading) return (
    <div className="page-header">
      <p>Loading your workspace...</p>
      <div className="spinner"></div>
    </div>
  );

  if (error) return (
    <div className="page-header">
      <p style={{color: 'var(--accent)'}}>{error}</p>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard Overview</h2>
        <p>Manage your linked Instagram Professional accounts.</p>
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <button className="primary-btn add-account-btn" onClick={handleAddAccount}>
          <Plus size={18} />
          Add Instagram Account
        </button>
        <button className="secondary-btn" onClick={copyWorkspaceLink} title="Copy workspace link for cross-device access">
          <Users size={18} />
          Share Workspace Link
        </button>
      </div>

      {/* Accounts Grid */}
      {accounts.length === 0 ? (
        <div className="glass-panel empty-state animate-slide-in">
          <Users size={48} color="var(--text-muted)" />
          <h3>No accounts linked yet</h3>
          <p>Click "Add Instagram Account" above to connect your first Instagram Business or Creator account.</p>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(acc => (
            <div key={acc.id} className="account-card glass-panel animate-slide-in">
              <button 
                className="remove-btn" 
                onClick={() => handleRemoveAccount(acc.id)}
                title="Remove account"
              >
                <Trash2 size={14} />
              </button>
              <img src={acc.profile_picture_url || 'https://via.placeholder.com/80'} alt="Profile" />
              <h3 style={{fontSize: '16px', fontWeight: '600'}}>@{acc.username}</h3>
              
              <div className="account-stats">
                <div className="stat">
                  <span className="stat-val">{acc.followers_count?.toLocaleString() || 0}</span>
                  <span className="stat-label">Followers</span>
                </div>
                <div className="stat">
                  <span className="stat-val">{acc.media_count?.toLocaleString() || 0}</span>
                  <span className="stat-label">Posts</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dashboard;
