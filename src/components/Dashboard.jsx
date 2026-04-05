import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

function Dashboard() {
  const [searchParams] = useSearchParams();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Determine user ID (In a real app, store this in Context/Local Storage)
    const userId = searchParams.get('user') || localStorage.getItem('ig_user_id');
    if (userId) {
      localStorage.setItem('ig_user_id', userId);
      fetchAccounts(userId);
    } else {
      setError("Not logged in.");
      setLoading(false);
    }
  }, [searchParams]);

  const fetchAccounts = async (userId) => {
    try {
      const res = await axios.get(`/api/accounts?user_id=${userId}`);
      setAccounts(res.data.accounts || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("Could not fetch accounts. Did you link an Instagram Professional account?");
      setLoading(false);
    }
  };

  if (loading) return <div className="page-header"><p>Loading your accounts...</p></div>;
  if (error) return <div className="page-header"><p style={{color: 'var(--accent)'}}>{error}</p></div>;

  return (
    <div>
      <div className="page-header">
        <h2>Dashboard Overview</h2>
        <p>Monitor your linked Instagram Professional accounts.</p>
      </div>

      {accounts.length === 0 ? (
        <div className="glass-panel" style={{padding: '32px', textAlign: 'center'}}>
          <p>No Instagram Business accounts found.</p>
        </div>
      ) : (
        <div className="accounts-grid">
          {accounts.map(acc => (
            <div key={acc.id} className="account-card glass-panel animate-slide-in">
              <img src={acc.profile_picture_url || 'https://via.placeholder.com/80'} alt="Profile" />
              <h3 style={{fontSize: '16px', fontWeight: '600'}}>@{acc.username}</h3>
              
              <div className="account-stats">
                <div className="stat">
                  <span className="stat-val">{acc.followers_count || 0}</span>
                  <span className="stat-label">Followers</span>
                </div>
                <div className="stat">
                  <span className="stat-val">{acc.media_count || 0}</span>
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
