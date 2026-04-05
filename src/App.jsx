import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Send, Settings, Camera } from 'lucide-react';
import './index.css';
import './App.css';
import Dashboard from './components/Dashboard';
import MultiPost from './components/MultiPost';

function Sidebar() {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Post to All', path: '/post', icon: Send },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="sidebar glass-panel">
      <div className="brand">
        <Camera className="brand-icon" size={28} />
        <h2>InstaManager</h2>
      </div>
      <div className="nav-links">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
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

function Login() {
  const [status, setStatus] = React.useState('');
  const location = useLocation();

  React.useEffect(() => {
    // If we were redirected back with a code, process it!
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    
    if (code) {
      setStatus('Exchanging token...');
      fetch('/api/auth/instagram/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      })
      .then(res => res.json())
      .then(data => {
        if (data.user_id) {
          localStorage.setItem('ig_user_id', data.user_id);
          window.location.href = '/dashboard?user=' + data.user_id;
        } else {
          setStatus('Authentication failed.');
        }
      })
      .catch(err => {
        console.error(err);
        setStatus('Server completely failed to exchange the code.');
      });
    }
  }, []);

  const handleLogin = async () => {
    try {
      const response = await fetch('/api/auth/instagram');
      const data = await response.json();
      window.location.href = data.url; // Redirect to Instagram Auth
    } catch (err) {
      console.error(err);
      setStatus('Backend server is down.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card glass-panel animate-slide-in">
        <Camera size={48} color="var(--accent)" style={{ marginBottom: '20px' }}/>
        <h1>InstaManager Pro</h1>
        <p>Manage analytics and multi-post using Native Instagram Business Login.</p>
        <button className="primary-btn login-btn" onClick={handleLogin}>
          Login with Instagram
        </button>
        {status && <p style={{marginTop: '20px', color: 'var(--accent)'}}>{status}</p>}
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard/*" element={<Layout><Dashboard /></Layout>} />
        <Route path="/post/*" element={<Layout><MultiPost /></Layout>} />
        <Route path="/settings" element={<Layout><div className="page-header"><h2>Settings</h2><p>Coming soon.</p></div></Layout>} />
      </Routes>
    </Router>
  );
}

export default App;
