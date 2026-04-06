import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Send, Settings, Camera, BarChart2 } from 'lucide-react';
import './index.css';
import './App.css';
import Dashboard from './components/Dashboard';
import MultiPost from './components/MultiPost';
import Analytics from './components/Analytics';

// Generate or retrieve workspace ID
function getWorkspaceId() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('workspace') || params.get('state');
  if (fromUrl) {
    localStorage.setItem('workspace_id', fromUrl);
    return fromUrl;
  }
  return localStorage.getItem('workspace_id');
}

function Sidebar() {
  const location = useLocation();
  const workspaceId = getWorkspaceId();

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Post to All', path: '/post', icon: Send },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="sidebar glass-panel">
      <div className="brand">
        <Camera className="brand-icon" size={28} />
        <h2>InstaManager</h2>
      </div>
      {workspaceId && (
        <div className="workspace-badge">
          <span className="workspace-label">Workspace</span>
          <span className="workspace-id">{workspaceId}</span>
        </div>
      )}
      <div className="nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path));
          return (
            <Link key={item.name} to={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Layout({ children }) {
  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}

// This component handles the OAuth callback from Instagram
function OAuthCallback() {
  const [status, setStatus] = useState('Processing login...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const workspaceId = params.get('state') || localStorage.getItem('workspace_id');

    if (!code) {
      setStatus('No authorization code found.');
      return;
    }

    fetch('/_/backend/auth/instagram/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, workspace_id: workspaceId })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Redirect back to dashboard
        window.location.href = `/?workspace=${workspaceId}`;
      } else {
        setStatus('Authentication failed: ' + (data.error || 'Unknown error'));
      }
    })
    .catch(err => {
      console.error(err);
      setStatus('Server failed to exchange the code.');
    });
  }, []);

  return (
    <div className="login-container">
      <div className="login-card glass-panel animate-slide-in">
        <Camera size={48} color="var(--accent)" style={{ marginBottom: '20px' }}/>
        <h1>Connecting Account...</h1>
        <p style={{marginTop: '16px', color: 'var(--text-muted)'}}>{status}</p>
        <div className="spinner"></div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout><Dashboard /></Layout>} />
        <Route path="/analytics" element={<Layout><Analytics /></Layout>} />
        <Route path="/post/*" element={<Layout><MultiPost /></Layout>} />
        <Route path="/callback" element={<OAuthCallback />} />
        <Route path="/settings" element={<Layout><div className="page-header"><h2>Settings</h2><p>Coming soon.</p></div></Layout>} />
      </Routes>
    </Router>
  );
}

export default App;
