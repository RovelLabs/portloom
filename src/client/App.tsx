import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  Layers,
  Shield,
  Radio,
  FileCode,
  Settings as SettingsIcon,
  RefreshCw,
  Trash2,
  Plus,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Lock,
  X,
  Zap,
  Terminal,
  Server,
  AlertTriangle
} from 'lucide-react';
import { ru } from './locales/ru';
import { en } from './locales/en';
import { PortEntry, HostsProfile, ProxyRoute, TrafficItem, MockRule, CertInfo } from '../types';

export default function App() {
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const t = useMemo(() => (lang === 'ru' ? ru : en), [lang]);

  const initialTab = (window.location.hash.replace('#', '') || 'overview') as any;
  const [activeTab, setActiveTabState] = useState<'overview' | 'ports' | 'hosts' | 'proxy' | 'traffic' | 'mocks' | 'settings'>(
    ['overview', 'ports', 'hosts', 'proxy', 'traffic', 'mocks', 'settings'].includes(initialTab) ? initialTab : 'overview'
  );

  const setActiveTab = (tab: 'overview' | 'ports' | 'hosts' | 'proxy' | 'traffic' | 'mocks' | 'settings') => {
    setActiveTabState(tab);
    window.location.hash = tab;
  };
  
  // Data states with immediate sane seed
  const [ports, setPorts] = useState<PortEntry[]>([
    { port: 3000, protocol: 'TCP', address: '127.0.0.1:3000', pid: 14228, processName: 'node.exe', memoryMb: 54, isSystemProcess: false },
    { port: 5173, protocol: 'TCP', address: '127.0.0.1:5173', pid: 18912, processName: 'vite.exe', memoryMb: 68, isSystemProcess: false },
    { port: 8000, protocol: 'TCP', address: '127.0.0.1:8000', pid: 9140, processName: 'python.exe', memoryMb: 42, isSystemProcess: false },
    { port: 5432, protocol: 'TCP', address: '127.0.0.1:5432', pid: 4810, processName: 'postgres.exe', memoryMb: 85, isSystemProcess: false },
    { port: 135, protocol: 'TCP', address: '0.0.0.0:135', pid: 1416, processName: 'svchost.exe', memoryMb: 20, isSystemProcess: true },
    { port: 445, protocol: 'TCP', address: '0.0.0.0:445', pid: 4, processName: 'System', memoryMb: 15, isSystemProcess: true }
  ]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  const [hostsProfiles, setHostsProfiles] = useState<HostsProfile[]>([
    {
      id: 'default',
      name: 'Основной (Default)',
      active: true,
      records: [
        { id: '1', ip: '127.0.0.1', domain: 'my-app.local', enabled: true, comment: 'Frontend dev' },
        { id: '2', ip: '127.0.0.1', domain: 'api.my-app.local', enabled: true, comment: 'Backend API' },
        { id: '3', ip: '127.0.0.1', domain: 'tma-bot.local', enabled: true, comment: 'Telegram Mini App' }
      ]
    }
  ]);
  const [activeProfileId, setActiveProfileId] = useState<string>('default');
  const [hostsBackups, setHostsBackups] = useState<Array<{ name: string; path: string; date: string }>>([]);
  const [routes, setRoutes] = useState<ProxyRoute[]>([
    { id: 'r1', domain: 'my-app.local', pathPrefix: '/', targetUrl: 'http://127.0.0.1:3000', sslEnabled: true, stripPrefix: false, corsEnabled: true, createdAt: new Date().toISOString() },
    { id: 'r2', domain: 'api.my-app.local', pathPrefix: '/', targetUrl: 'http://127.0.0.1:8000', sslEnabled: true, stripPrefix: false, corsEnabled: true, createdAt: new Date().toISOString() },
    { id: 'r3', domain: 'tma-bot.local', pathPrefix: '/', targetUrl: 'http://127.0.0.1:5173', sslEnabled: true, stripPrefix: false, corsEnabled: true, createdAt: new Date().toISOString() }
  ]);
  const [traffic, setTraffic] = useState<TrafficItem[]>([]);
  const [mocks, setMocks] = useState<MockRule[]>([
    { id: 'm1', name: 'ЮKassa Webhook Success', domain: '*', path: '/api/v1/payments/webhook', method: 'POST', statusCode: 200, delayMs: 50, headers: { 'Content-Type': 'application/json' }, responseBody: '{\n  "status": "paid",\n  "invoice_id": "inv_88491"\n}', enabled: true },
    { id: 'm2', name: 'Telegram Bot Auth Check', domain: '*', path: '/api/auth/telegram', method: 'GET', statusCode: 200, delayMs: 0, headers: { 'Content-Type': 'application/json' }, responseBody: '{\n  "authenticated": true,\n  "user": "developer"\n}', enabled: true }
  ]);
  const [caInfo, setCaInfo] = useState<CertInfo | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Filter & Search states
  const [portSearch, setPortSearch] = useState('');
  const [portFilterDev, setPortFilterDev] = useState(false);
  const [trafficSearch, setTrafficSearch] = useState('');

  // Modals & Drawers
  const [killModal, setKillModal] = useState<PortEntry | null>(null);
  const [addRouteModal, setAddRouteModal] = useState(false);
  const [addHostModal, setAddHostModal] = useState(false);
  const [addMockModal, setAddMockModal] = useState<Partial<MockRule> | null>(null);
  const [selectedTraffic, setSelectedTraffic] = useState<TrafficItem | null>(null);
  const [backupsModal, setBackupsModal] = useState(false);

  // Form states
  const [meshDomain, setMeshDomain] = useState('');
  const [meshPort, setMeshPort] = useState('3000');
  const [newHostDomain, setNewHostDomain] = useState('');
  const [newHostIp, setNewHostIp] = useState('127.0.0.1');
  const [newHostComment, setNewHostComment] = useState('');
  const [copiedCurl, setCopiedCurl] = useState(false);

  const notify = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // 1. Initial Load & Fetch
  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.language && ['ru', 'en'].includes(data.language)) {
          setLang(data.language);
        }
      }
    } catch {}
  };

  const fetchPorts = async () => {
    setLoadingPorts(true);
    try {
      const res = await fetch('/api/ports');
      if (res.ok) {
        const data = await res.json();
        setPorts(data.ports || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingPorts(false);
    }
  };

  const fetchHosts = async () => {
    try {
      const res = await fetch('/api/hosts');
      if (res.ok) {
        const data = await res.json();
        setHostsProfiles(data.profiles || []);
        setActiveProfileId(data.activeProfileId || 'default');
        setHostsBackups(data.backups || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await fetch('/api/proxy/routes');
      if (res.ok) {
        const data = await res.json();
        setRoutes(data.routes || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTraffic = async () => {
    try {
      const res = await fetch('/api/traffic');
      if (res.ok) {
        const data = await res.json();
        setTraffic(data.items || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchMocks = async () => {
    try {
      const res = await fetch('/api/mocks');
      if (res.ok) {
        const data = await res.json();
        setMocks(data.mocks || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchCerts = async () => {
    try {
      const res = await fetch('/api/certs');
      if (res.ok) {
        const data = await res.json();
        setCaInfo(data.caInfo || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'ports' || activeTab === 'overview') {
      fetchPorts();
    }
  }, [activeTab]);

  useEffect(() => {
    fetchStatus();
    fetchPorts();
    fetchHosts();
    fetchRoutes();
    fetchTraffic();
    fetchMocks();
    fetchCerts();

    // WebSocket connection for live traffic
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);
      ws.onerror = () => setWsConnected(false);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'TRAFFIC_ITEM') {
            setTraffic((prev) => [msg.payload, ...prev.slice(0, 499)]);
          } else if (msg.type === 'TRAFFIC_CLEAR') {
            setTraffic([]);
          }
        } catch {}
      };
    } catch {}

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Actions
  const handleKillProcess = async () => {
    if (!killModal) return;
    try {
      const res = await fetch('/api/ports/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pid: killModal.pid })
      });
      const data = await res.json();
      if (data.success) {
        notify(data.message, 'success');
        fetchPorts();
      } else {
        notify(data.message, 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setKillModal(null);
    }
  };

  const handleCreateMesh = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meshDomain || !meshPort) return;
    try {
      const cleanDomain = meshDomain.toLowerCase().trim();
      const targetUrl = `http://127.0.0.1:${meshPort.trim()}`;

      const res = await fetch('/api/proxy/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: cleanDomain,
          targetUrl,
          pathPrefix: '/',
          sslEnabled: true,
          corsEnabled: true,
          addToHosts: true
        })
      });
      const data = await res.json();
      if (data.success) {
        notify(lang === 'ru' ? `Домен https://${cleanDomain} успешно создан и защищен SSL!` : `Domain https://${cleanDomain} created and secured with SSL!`, 'success');
        setMeshDomain('');
        fetchRoutes();
        fetchHosts();
        fetchCerts();
      } else {
        notify(data.error || 'Failed to create route', 'error');
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteRoute = async (id: string) => {
    try {
      const res = await fetch(`/api/proxy/routes/${id}`, { method: 'DELETE' });
      if (res.ok) {
        notify(lang === 'ru' ? 'Маршрут удален' : 'Route removed', 'info');
        fetchRoutes();
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleFlushDns = async () => {
    try {
      const res = await fetch('/api/hosts/flushdns', { method: 'POST' });
      const data = await res.json();
      notify(data.message, data.success ? 'success' : 'error');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleTrustCA = async () => {
    try {
      const res = await fetch('/api/certs/trust', { method: 'POST' });
      const data = await res.json();
      notify(data.message, data.success ? 'success' : 'error');
      fetchCerts();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleAddHostRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHostDomain) return;
    try {
      const res = await fetch('/api/hosts/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newHostDomain, ip: newHostIp, comment: newHostComment })
      });
      const data = await res.json();
      if (data.success) {
        notify(lang === 'ru' ? 'Запись добавлена в hosts' : 'Record added to hosts', 'success');
        setAddHostModal(false);
        setNewHostDomain('');
        setNewHostComment('');
        fetchHosts();
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleToggleHostRecord = async (recordId: string, enabled: boolean) => {
    try {
      await fetch('/api/hosts/toggle-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId, enabled })
      });
      fetchHosts();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleSaveMock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addMockModal) return;
    try {
      const res = await fetch('/api/mocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addMockModal,
          statusCode: Number(addMockModal.statusCode || 200),
          delayMs: Number(addMockModal.delayMs || 0),
          enabled: true,
          headers: { 'Content-Type': 'application/json' }
        })
      });
      const data = await res.json();
      if (data.success) {
        notify(lang === 'ru' ? 'Мок-ответ сохранен' : 'Mock rule saved', 'success');
        setAddMockModal(null);
        fetchMocks();
      }
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteMock = async (id: string) => {
    try {
      await fetch(`/api/mocks/${id}`, { method: 'DELETE' });
      notify(lang === 'ru' ? 'Мок удален' : 'Mock deleted', 'info');
      fetchMocks();
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  const handleClearTraffic = async () => {
    try {
      await fetch('/api/traffic', { method: 'DELETE' });
      setTraffic([]);
      notify(lang === 'ru' ? 'Лог трафика очищен' : 'Traffic log cleared', 'info');
    } catch (err: any) {
      notify(err.message, 'error');
    }
  };

  // Filtered Ports
  const filteredPorts = useMemo(() => {
    return ports.filter((p) => {
      const matchSearch =
        portSearch === '' ||
        String(p.port).includes(portSearch) ||
        p.processName.toLowerCase().includes(portSearch.toLowerCase()) ||
        String(p.pid).includes(portSearch);

      const matchDev = !portFilterDev || (!p.isSystemProcess && p.port >= 1024);
      return matchSearch && matchDev;
    });
  }, [ports, portSearch, portFilterDev]);

  // Filtered Traffic
  const filteredTraffic = useMemo(() => {
    return traffic.filter((tItem) => {
      if (!trafficSearch) return true;
      const q = trafficSearch.toLowerCase();
      return tItem.url.toLowerCase().includes(q) || tItem.method.toLowerCase().includes(q) || String(tItem.status).includes(q);
    });
  }, [traffic, trafficSearch]);

  const activeProfile = hostsProfiles.find((p) => p.id === activeProfileId) || hostsProfiles[0];

  return (
    <div className="app-container">
      {/* Notifications banner */}
      {notification && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: 8,
            backgroundColor:
              notification.type === 'success' ? 'rgba(16, 185, 129, 0.95)' :
              notification.type === 'error' ? 'rgba(244, 63, 94, 0.95)' : 'rgba(30, 41, 59, 0.95)',
            color: '#FFFFFF',
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          {notification.type === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}
          <span>{notification.msg}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/icon.svg" alt="Portloom" className="sidebar-logo" />
          <div className="sidebar-title">
            Port<span>loom</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={17} />
            <span className="nav-label">{t.nav.overview}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'ports' ? 'active' : ''}`}
            onClick={() => setActiveTab('ports')}
          >
            <Layers size={17} />
            <span className="nav-label">{t.nav.ports}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'hosts' ? 'active' : ''}`}
            onClick={() => setActiveTab('hosts')}
          >
            <Globe size={17} />
            <span className="nav-label">{t.nav.hosts}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'proxy' ? 'active' : ''}`}
            onClick={() => setActiveTab('proxy')}
          >
            <Shield size={17} />
            <span className="nav-label">{t.nav.proxy}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'traffic' ? 'active' : ''}`}
            onClick={() => setActiveTab('traffic')}
          >
            <Radio size={17} />
            <span className="nav-label">{t.nav.traffic}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'mocks' ? 'active' : ''}`}
            onClick={() => setActiveTab('mocks')}
          >
            <FileCode size={17} />
            <span className="nav-label">{t.nav.mocks}</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={17} />
            <span className="nav-label">{t.nav.settings}</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-badge">
            <span className="status-dot"></span>
            <small>{t.status.online}</small>
          </div>
          <small style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>:24224</small>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-title">{t.nav[activeTab]}</div>
          <div className="top-actions">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: wsConnected ? 'var(--accent-emerald)' : 'var(--text-muted)'
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: wsConnected ? 'var(--accent-emerald)' : 'var(--text-muted)'
                }}
              />
              <span>{wsConnected ? t.status.wsConnected : t.status.wsDisconnected}</span>
            </div>

            <button
              className="lang-btn"
              onClick={() => {
                const nextLang = lang === 'ru' ? 'en' : 'ru';
                setLang(nextLang);
                fetch('/api/config', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ language: nextLang })
                });
              }}
            >
              {lang === 'ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
            </button>
          </div>
        </header>

        {/* 1. OVERVIEW VIEW */}
        {activeTab === 'overview' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.overview.title}</h1>
              <p className="page-subtitle">{t.overview.subtitle}</p>
            </div>

            {/* 1-Click Instant HTTPS Mesh Banner */}
            <div className="action-banner">
              <div className="banner-title">
                <Zap size={18} color="var(--accent-cyan)" />
                {t.overview.quickMeshTitle}
              </div>
              <p className="banner-desc">{t.overview.quickMeshDesc}</p>
              <form className="banner-form" onSubmit={handleCreateMesh}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>https://</span>
                  <input
                    type="text"
                    className="input-field"
                    placeholder={t.overview.domainPlaceholder}
                    value={meshDomain}
                    onChange={(e) => setMeshDomain(e.target.value)}
                    style={{ width: 220 }}
                    required
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>→ localhost:</span>
                  <input
                    type="number"
                    className="input-field"
                    placeholder={t.overview.portPlaceholder}
                    value={meshPort}
                    onChange={(e) => setMeshPort(e.target.value)}
                    style={{ width: 100 }}
                    required
                  />
                </div>
                <button type="submit" className="btn-primary">
                  <Lock size={15} />
                  {t.overview.createBtn}
                </button>
              </form>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid-cards">
              <div className="stat-card" onClick={() => setActiveTab('ports')} style={{ cursor: 'pointer' }}>
                <span className="stat-label">{t.overview.cardPorts}</span>
                <span className="stat-value cyan">{ports.length}</span>
              </div>
              <div className="stat-card" onClick={() => setActiveTab('proxy')} style={{ cursor: 'pointer' }}>
                <span className="stat-label">{t.overview.cardRoutes}</span>
                <span className="stat-value emerald">{routes.length}</span>
              </div>
              <div className="stat-card" onClick={() => setActiveTab('hosts')} style={{ cursor: 'pointer' }}>
                <span className="stat-label">{t.overview.cardDomains}</span>
                <span className="stat-value amber">{activeProfile?.records?.length || 0}</span>
              </div>
              <div className="stat-card" onClick={() => setActiveTab('traffic')} style={{ cursor: 'pointer' }}>
                <span className="stat-label">{t.overview.cardTraffic}</span>
                <span className="stat-value">{traffic.length}</span>
              </div>
            </div>

            {/* Active Routes Table */}
            <div className="table-container">
              <div className="table-toolbar">
                <strong>{t.overview.activeServices}</strong>
                <button className="btn-secondary" onClick={() => setActiveTab('proxy')}>
                  <Plus size={14} />
                  {t.proxy.addRouteBtn}
                </button>
              </div>
              {routes.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t.overview.noRoutesYet}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.proxy.colDomain}</th>
                      <th>{t.proxy.colTarget}</th>
                      <th>{t.proxy.colSsl}</th>
                      <th>{t.proxy.colCors}</th>
                      <th>{t.ports.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routes.map((r) => (
                      <tr key={r.id}>
                        <td className="mono-cell" style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                          https://{r.domain}
                        </td>
                        <td className="mono-cell">{r.targetUrl}</td>
                        <td>
                          <span className="badge emerald">
                            <Lock size={11} /> HTTPS
                          </span>
                        </td>
                        <td>
                          <span className="badge slate">CORS OK</span>
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            style={{ padding: '4px 8px', fontSize: 11 }}
                            onClick={() => window.open(`https://${r.domain}`, '_blank')}
                          >
                            <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 2. PORTS MATRIX VIEW */}
        {activeTab === 'ports' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.ports.title}</h1>
              <p className="page-subtitle">{t.ports.subtitle}</p>
            </div>

            <div className="table-container">
              <div className="table-toolbar">
                <div style={{ display: 'flex', gap: 10, flex: 1, maxWidth: 500 }}>
                  <input
                    type="text"
                    className="input-field"
                    style={{ flex: 1 }}
                    placeholder={t.ports.searchPlaceholder}
                    value={portSearch}
                    onChange={(e) => setPortSearch(e.target.value)}
                  />
                  <button
                    className={`btn-secondary ${portFilterDev ? 'active' : ''}`}
                    onClick={() => setPortFilterDev(!portFilterDev)}
                  >
                    {t.ports.filterDev}
                  </button>
                </div>

                <button className="btn-secondary" onClick={fetchPorts} disabled={loadingPorts}>
                  <RefreshCw size={14} className={loadingPorts ? 'spin' : ''} />
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.ports.colPort}</th>
                    <th>{t.ports.colProcess}</th>
                    <th>{t.ports.colPid}</th>
                    <th>{t.ports.colMemory}</th>
                    <th>{t.ports.colAddress}</th>
                    <th>{t.ports.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPorts.map((p) => (
                    <tr key={`${p.port}-${p.pid}`}>
                      <td className="mono-cell" style={{ fontWeight: 700, color: 'var(--accent-cyan)' }}>
                        :{p.port}
                      </td>
                      <td style={{ fontWeight: 600 }}>
                        {p.processName}
                        {p.isSystemProcess && <span className="badge slate" style={{ marginLeft: 6 }}>SYSTEM</span>}
                      </td>
                      <td className="mono-cell" style={{ color: 'var(--text-secondary)' }}>
                        {p.pid}
                      </td>
                      <td className="mono-cell">{p.memoryMb ? `${p.memoryMb} MB` : '—'}</td>
                      <td className="mono-cell" style={{ color: 'var(--text-muted)' }}>
                        {p.address}
                      </td>
                      <td>
                        {p.isSystemProcess ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t.ports.systemProtected}</span>
                        ) : (
                          <button className="btn-danger" onClick={() => setKillModal(p)}>
                            <Trash2 size={12} />
                            {t.ports.killBtn}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. HOSTS VIEW */}
        {activeTab === 'hosts' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.hosts.title}</h1>
              <p className="page-subtitle">{t.hosts.subtitle}</p>
            </div>

            <div className="table-container">
              <div className="table-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t.hosts.activeProfile}:</span>
                  <strong>{activeProfile?.name || 'Default'}</strong>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-secondary" onClick={handleFlushDns}>
                    <RefreshCw size={14} />
                    {t.hosts.flushDnsBtn}
                  </button>
                  <button className="btn-secondary" onClick={() => setBackupsModal(true)}>
                    {t.hosts.backupsBtn} ({hostsBackups.length})
                  </button>
                  <button className="btn-primary" onClick={() => setAddHostModal(true)}>
                    <Plus size={14} />
                    {t.hosts.addDomainBtn}
                  </button>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.hosts.colStatus}</th>
                    <th>{t.hosts.colDomain}</th>
                    <th>{t.hosts.colIp}</th>
                    <th>{t.hosts.colComment}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeProfile?.records?.map((r) => (
                    <tr key={r.id}>
                      <td style={{ width: 80 }}>
                        <input
                          type="checkbox"
                          checked={r.enabled}
                          onChange={(e) => handleToggleHostRecord(r.id, e.target.checked)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </td>
                      <td className="mono-cell" style={{ fontWeight: 600, color: r.enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {r.domain}
                      </td>
                      <td className="mono-cell" style={{ color: 'var(--text-secondary)' }}>
                        {r.ip}
                      </td>
                      <td style={{ color: 'var(--text-muted)' }}>{r.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. PROXY & SSL VIEW */}
        {activeTab === 'proxy' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.proxy.title}</h1>
              <p className="page-subtitle">{t.proxy.subtitle}</p>
            </div>

            <div className="table-container">
              <div className="table-toolbar">
                <strong>{routes.length} Active Routes</strong>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn-secondary" onClick={handleTrustCA}>
                    <Shield size={14} />
                    {t.proxy.trustCaBtn}
                  </button>
                  <button className="btn-primary" onClick={() => setAddRouteModal(true)}>
                    <Plus size={14} />
                    {t.proxy.addRouteBtn}
                  </button>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.proxy.colDomain}</th>
                    <th>{t.proxy.colPrefix}</th>
                    <th>{t.proxy.colTarget}</th>
                    <th>{t.proxy.colSsl}</th>
                    <th>{t.proxy.colCors}</th>
                    <th>{t.proxy.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id}>
                      <td className="mono-cell" style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                        https://{r.domain}
                      </td>
                      <td className="mono-cell">{r.pathPrefix}</td>
                      <td className="mono-cell">{r.targetUrl}</td>
                      <td>
                        <span className="badge emerald">
                          <Lock size={11} /> VALID SSL
                        </span>
                      </td>
                      <td>
                        <span className="badge slate">CORS ENABLED</span>
                      </td>
                      <td>
                        <button className="btn-danger" onClick={() => handleDeleteRoute(r.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. TRAFFIC INSPECTOR VIEW */}
        {activeTab === 'traffic' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.traffic.title}</h1>
              <p className="page-subtitle">{t.traffic.subtitle}</p>
            </div>

            <div className="table-container">
              <div className="table-toolbar">
                <input
                  type="text"
                  className="input-field"
                  style={{ width: 320 }}
                  placeholder={t.traffic.searchPlaceholder}
                  value={trafficSearch}
                  onChange={(e) => setTrafficSearch(e.target.value)}
                />
                <button className="btn-secondary" onClick={handleClearTraffic}>
                  <Trash2 size={14} />
                  {t.traffic.clearBtn}
                </button>
              </div>

              {filteredTraffic.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  {t.traffic.noTraffic}
                </div>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.traffic.colStatus}</th>
                      <th>{t.traffic.colMethod}</th>
                      <th>{t.traffic.colUrl}</th>
                      <th>{t.traffic.colLatency}</th>
                      <th>{t.traffic.colTime}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTraffic.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedTraffic(item)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <span
                            className={`badge ${
                              item.status < 300 ? 'emerald' : item.status < 400 ? 'cyan' : item.status < 500 ? 'amber' : 'rose'
                            }`}
                          >
                            {item.status}
                          </span>
                          {item.isMocked && (
                            <span className="badge cyan" style={{ marginLeft: 4 }}>
                              MOCK
                            </span>
                          )}
                        </td>
                        <td className="mono-cell" style={{ fontWeight: 700 }}>
                          {item.method}
                        </td>
                        <td className="mono-cell" style={{ color: 'var(--accent-cyan)' }}>
                          {item.url}
                        </td>
                        <td className="mono-cell">{item.latencyMs} ms</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* 6. MOCKS VIEW */}
        {activeTab === 'mocks' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.mocks.title}</h1>
              <p className="page-subtitle">{t.mocks.subtitle}</p>
            </div>

            <div className="table-container">
              <div className="table-toolbar">
                <strong>{mocks.length} Offline Rules</strong>
                <button
                  className="btn-primary"
                  onClick={() =>
                    setAddMockModal({
                      name: 'Sample Mock',
                      domain: '*',
                      path: '/api/test',
                      method: 'GET',
                      statusCode: 200,
                      delayMs: 0,
                      responseBody: '{\n  "status": "ok"\n}'
                    })
                  }
                >
                  <Plus size={14} />
                  {t.mocks.addMockBtn}
                </button>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.mocks.colName}</th>
                    <th>{t.mocks.colEndpoint}</th>
                    <th>{t.mocks.colStatus}</th>
                    <th>{t.mocks.colDelay}</th>
                    <th>{t.ports.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {mocks.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.name}</td>
                      <td className="mono-cell">
                        <span style={{ color: 'var(--accent-cyan)' }}>[{m.method}]</span> {m.domain}{m.path}
                      </td>
                      <td>
                        <span className="badge emerald">{m.statusCode}</span>
                      </td>
                      <td className="mono-cell">{m.delayMs} ms</td>
                      <td>
                        <button className="btn-danger" onClick={() => handleDeleteMock(m.id)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. SETTINGS VIEW */}
        {activeTab === 'settings' && (
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">{t.settings.title}</h1>
              <p className="page-subtitle">{t.settings.subtitle}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 800 }}>
              {/* Root CA Box */}
              <div className="stat-card">
                <strong style={{ fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Shield size={18} color="var(--accent-emerald)" />
                  {t.settings.caTitle}
                </strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
                  {t.settings.caDesc}
                </p>
                {caInfo && (
                  <div style={{ background: 'var(--bg-main)', padding: 12, borderRadius: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.settings.caFingerprint}:</div>
                    <div className="mono-cell" style={{ fontSize: 12, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                      {caInfo.fingerprint}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.settings.caExpires}:</div>
                    <div className="mono-cell" style={{ fontSize: 12 }}>
                      {new Date(caInfo.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
                <div>
                  <button className="btn-primary" onClick={handleTrustCA}>
                    <Check size={14} />
                    {t.settings.caTrustAction}
                  </button>
                </div>
              </div>

              {/* Data Storage Box */}
              <div className="stat-card">
                <strong style={{ fontSize: 16, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Server size={18} color="var(--accent-cyan)" />
                  {t.settings.storageTitle}
                </strong>
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 14 }}>
                  {t.settings.storageDesc}
                </p>
                <div className="mono-cell" style={{ background: 'var(--bg-main)', padding: 10, borderRadius: 6, fontSize: 12, marginBottom: 14 }}>
                  %APPDATA%\Portloom\
                </div>
                <div>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      window.open('/api/config', '_blank');
                    }}
                  >
                    <FileCode size={14} />
                    {t.settings.exportConfigBtn}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* KILL PROCESS MODAL */}
      {killModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-title">{t.ports.killConfirmTitle}</span>
              <button onClick={() => setKillModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p>
                {t.ports.killConfirmMsg
                  .replace('{name}', killModal.processName)
                  .replace('{pid}', String(killModal.pid))
                  .replace('{port}', String(killModal.port))}
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setKillModal(null)}>
                {t.ports.killCancel}
              </button>
              <button className="btn-danger" onClick={handleKillProcess}>
                {t.ports.killSubmit}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD HOST MODAL */}
      {addHostModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-title">{t.hosts.addModalTitle}</span>
              <button onClick={() => setAddHostModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddHostRecord}>
              <div className="modal-body">
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.hosts.inputDomain}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    placeholder="my-project.local"
                    value={newHostDomain}
                    onChange={(e) => setNewHostDomain(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.hosts.inputIp}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={newHostIp}
                    onChange={(e) => setNewHostIp(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.hosts.inputComment}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    placeholder="Frontend dev"
                    value={newHostComment}
                    onChange={(e) => setNewHostComment(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAddHostModal(false)}>
                  {t.ports.killCancel}
                </button>
                <button type="submit" className="btn-primary">
                  {t.hosts.saveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD PROXY ROUTE MODAL */}
      {addRouteModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-title">{t.proxy.addModalTitle}</span>
              <button onClick={() => setAddRouteModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const domain = (form.elements.namedItem('domain') as HTMLInputElement).value;
                const targetUrl = (form.elements.namedItem('targetUrl') as HTMLInputElement).value;
                const pathPrefix = (form.elements.namedItem('pathPrefix') as HTMLInputElement).value || '/';

                const res = await fetch('/api/proxy/routes', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    domain,
                    targetUrl,
                    pathPrefix,
                    sslEnabled: true,
                    corsEnabled: true,
                    addToHosts: true
                  })
                });
                if (res.ok) {
                  notify(lang === 'ru' ? 'Маршрут создан' : 'Route created', 'success');
                  setAddRouteModal(false);
                  fetchRoutes();
                  fetchHosts();
                }
              }}
            >
              <div className="modal-body">
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.proxy.domainLabel}
                  </label>
                  <input
                    name="domain"
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    placeholder="api.my-app.local"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.proxy.targetUrlLabel}
                  </label>
                  <input
                    name="targetUrl"
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    placeholder="http://127.0.0.1:8000"
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.proxy.pathPrefixLabel}
                  </label>
                  <input
                    name="pathPrefix"
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    defaultValue="/"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAddRouteModal(false)}>
                  {t.ports.killCancel}
                </button>
                <button type="submit" className="btn-primary">
                  {t.hosts.saveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MOCK MODAL */}
      {addMockModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-title">{t.mocks.modalTitle}</span>
              <button onClick={() => setAddMockModal(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveMock}>
              <div className="modal-body">
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.mocks.inputName}
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%' }}
                    value={addMockModal.name || ''}
                    onChange={(e) => setAddMockModal({ ...addMockModal, name: e.target.value })}
                    required
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t.mocks.inputMethod}
                    </label>
                    <select
                      className="input-field"
                      style={{ width: '100%' }}
                      value={addMockModal.method || 'GET'}
                      onChange={(e) => setAddMockModal({ ...addMockModal, method: e.target.value })}
                    >
                      <option value="*">ANY (*)</option>
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t.mocks.inputPath}
                    </label>
                    <input
                      type="text"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={addMockModal.path || ''}
                      onChange={(e) => setAddMockModal({ ...addMockModal, path: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t.mocks.inputStatus}
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={addMockModal.statusCode || 200}
                      onChange={(e) => setAddMockModal({ ...addMockModal, statusCode: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                      {t.mocks.inputDelay}
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      style={{ width: '100%' }}
                      value={addMockModal.delayMs || 0}
                      onChange={(e) => setAddMockModal({ ...addMockModal, delayMs: Number(e.target.value) })}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                    {t.mocks.inputBody}
                  </label>
                  <textarea
                    className="input-field"
                    rows={4}
                    style={{ width: '100%', fontFamily: 'var(--font-mono)' }}
                    value={addMockModal.responseBody || ''}
                    onChange={(e) => setAddMockModal({ ...addMockModal, responseBody: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setAddMockModal(null)}>
                  {t.ports.killCancel}
                </button>
                <button type="submit" className="btn-primary">
                  {t.hosts.saveBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRAFFIC DETAIL DRAWER */}
      {selectedTraffic && (
        <div className="drawer">
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className={`badge ${
                  selectedTraffic.status < 300 ? 'emerald' : selectedTraffic.status < 400 ? 'cyan' : 'rose'
                }`}
              >
                {selectedTraffic.status}
              </span>
              <strong>{selectedTraffic.method}</strong>
              <span className="mono-cell" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {selectedTraffic.pathname}
              </span>
            </div>
            <button onClick={() => setSelectedTraffic(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t.traffic.tabCurl}</span>
                <button
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  onClick={() => {
                    navigator.clipboard.writeText(selectedTraffic.curlCommand);
                    setCopiedCurl(true);
                    setTimeout(() => setCopiedCurl(false), 2000);
                  }}
                >
                  {copiedCurl ? <Check size={12} /> : <Copy size={12} />}
                  {copiedCurl ? 'Copied' : t.traffic.copyCurl}
                </button>
              </div>
              <pre className="code-block">{selectedTraffic.curlCommand}</pre>
            </div>

            <div>
              <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                {t.traffic.tabHeaders}
              </span>
              <pre className="code-block">{JSON.stringify(selectedTraffic.requestHeaders, null, 2)}</pre>
            </div>

            {selectedTraffic.requestBody && (
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {t.traffic.tabBody}
                </span>
                <pre className="code-block">{selectedTraffic.requestBody}</pre>
              </div>
            )}

            {selectedTraffic.responseBody && (
              <div>
                <span style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
                  {t.traffic.tabResponse}
                </span>
                <pre className="code-block">{selectedTraffic.responseBody}</pre>
              </div>
            )}

            <div>
              <button
                className="btn-primary"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => {
                  setAddMockModal({
                    name: `Mock for ${selectedTraffic.pathname}`,
                    domain: selectedTraffic.host,
                    path: selectedTraffic.pathname,
                    method: selectedTraffic.method,
                    statusCode: 200,
                    delayMs: 0,
                    responseBody: selectedTraffic.responseBody || '{\n  "status": "mocked"\n}'
                  });
                  setSelectedTraffic(null);
                  setActiveTab('mocks');
                }}
              >
                <Plus size={14} />
                {t.traffic.createMockBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOSTS BACKUPS MODAL */}
      {backupsModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <span className="modal-title">{t.hosts.backupsTitle}</span>
              <button onClick={() => setBackupsModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              {hostsBackups.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>{t.hosts.noBackups}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {hostsBackups.map((b) => (
                    <div
                      key={b.path}
                      style={{
                        padding: 10,
                        background: 'var(--bg-main)',
                        borderRadius: 6,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div className="mono-cell" style={{ fontSize: 12, fontWeight: 600 }}>
                          {b.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {new Date(b.date).toLocaleString()}
                        </div>
                      </div>
                      <button
                        className="btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={async () => {
                          const res = await fetch('/api/hosts/restore', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ backupPath: b.path })
                          });
                          if (res.ok) {
                            notify(lang === 'ru' ? 'Hosts успешно восстановлен' : 'Hosts restored', 'success');
                            setBackupsModal(false);
                            fetchHosts();
                          }
                        }}
                      >
                        {t.hosts.restoreBtn}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
