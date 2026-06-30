import React, { useState, useEffect, useRef } from 'react';
import { 
  Bot, Send, Plus, Trash, Settings, Folder, FileCode, Copy, 
  Download, BookOpen, Terminal, Sliders, Database, Sparkles, 
  Save, Search, Code, ChevronRight, X, Eye, Edit3, Check
} from 'lucide-react';
import { marked } from 'marked';
import confetti from 'canvas-confetti';
import './App.css';

// Configure marked options
marked.setOptions({
  breaks: true,
  gfm: true
});

const API_BASE = 'http://localhost:8000/api';

const renderMarkdown = (text) => {
  return { __html: marked.parse(text || '') };
};

function App() {
  // Navigation & View states
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'presets' | 'vault'
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    geminiKey: localStorage.getItem('geminiKey') || '',
    model: localStorage.getItem('model') || 'gemini-2.5-flash',
    temperature: localStorage.getItem('temperature') || '0.2'
  });

  // Preset Templates
  const [presets, setPresets] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);

  // Saved Snippets Vault
  const [snippets, setSnippets] = useState([]);
  const [vaultSearch, setVaultSearch] = useState('');
  const [vaultFilterLang, setVaultFilterLang] = useState('');
  const [vaultLoading, setVaultLoading] = useState(false);
  const [editingSnippet, setEditingSnippet] = useState(null);

  // Workspace / Code IDE states
  const [workspaceFiles, setWorkspaceFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [showWorkspace, setShowWorkspace] = useState(false);

  // Action feedback states
  const [copiedFile, setCopiedFile] = useState(null);
  const [savedFilesStatus, setSavedFilesStatus] = useState({}); // { [filePath]: boolean }

  const messagesEndRef = useRef(null);

  // Load initial settings and sessions
  useEffect(() => {
    fetchSessions();
    fetchPresets();
    fetchSnippets();
  }, []);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, loading]);

  // Save settings helper
  const handleSaveSettings = (newSettings) => {
    setSettings(newSettings);
    localStorage.setItem('geminiKey', newSettings.geminiKey);
    localStorage.setItem('model', newSettings.model);
    localStorage.setItem('temperature', newSettings.temperature);
    setShowSettings(false);
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 } });
  };

  // 1. CHAT SESSION API CALLS
  const fetchSessions = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/`);
      const data = await res.json();
      setSessions(data);
      if (data.length > 0 && !activeSessionId) {
        handleSelectSession(data[0].id);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const handleSelectSession = async (id) => {
    setActiveSessionId(id);
    setActiveTab('chat');
    try {
      const res = await fetch(`${API_BASE}/sessions/${id}/`);
      const data = await res.json();
      setActiveSession(data);
      
      // Auto-extract files from the last assistant message
      if (data.messages && data.messages.length > 0) {
        const lastAssistantMsg = [...data.messages].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
          const { files } = parseAIResponse(lastAssistantMsg.content);
          if (files.length > 0) {
            setWorkspaceFiles(files);
            setActiveFile(files[0]);
            setShowWorkspace(true);
            return;
          }
        }
      }
      setWorkspaceFiles([]);
      setActiveFile(null);
      setShowWorkspace(false);
    } catch (err) {
      console.error('Error fetching session details:', err);
    }
  };

  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${API_BASE}/sessions/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Conversation ${sessions.length + 1}` })
      });
      const data = await res.json();
      setSessions([data, ...sessions]);
      setActiveSessionId(data.id);
      setActiveSession({ ...data, messages: [] });
      setWorkspaceFiles([]);
      setActiveFile(null);
      setShowWorkspace(false);
      setActiveTab('chat');
    } catch (err) {
      console.error('Error creating session:', err);
    }
  };

  const handleDeleteSession = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;
    try {
      await fetch(`${API_BASE}/sessions/${id}/`, { method: 'DELETE' });
      const updated = sessions.filter(s => s.id !== id);
      setSessions(updated);
      if (activeSessionId === id) {
        setActiveSession(null);
        setActiveSessionId(null);
        if (updated.length > 0) {
          handleSelectSession(updated[0].id);
        }
      }
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  };

  // 2. CHAT MESSAGE SEND
  const handleSendMessage = async (textToSend = null) => {
    const text = textToSend || inputValue;
    if (!text.trim() || loading) return;

    if (!activeSessionId) {
      // Create session first if none is active
      await handleCreateSession();
    }

    setInputValue('');
    setLoading(true);

    // Setup local user message in UI for responsiveness
    const tempUserMsg = { id: 'temp-user', role: 'user', content: text, created_at: new Date().toISOString() };
    setActiveSession(prev => ({
      ...prev,
      messages: [...(prev?.messages || []), tempUserMsg]
    }));

    try {
      const res = await fetch(`${API_BASE}/sessions/${activeSessionId || sessions[0]?.id}/send/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-Key': settings.geminiKey
        },
        body: JSON.stringify({
          content: text,
          model: settings.model,
          temperature: settings.temperature
        })
      });

      if (!res.ok) {
        throw new Error('Server returned error status');
      }

      const data = await res.json();
      
      // Update session listing (title, timestamp)
      fetchSessions();

      // Retrieve full updated session details
      const detailRes = await fetch(`${API_BASE}/sessions/${activeSessionId || sessions[0]?.id}/`);
      const detailData = await detailRes.json();
      setActiveSession(detailData);

      // Auto check if latest assistant message has project files
      const assistantMsgs = detailData.messages.filter(m => m.role === 'assistant');
      if (assistantMsgs.length > 0) {
        const lastMsg = assistantMsgs[assistantMsgs.length - 1];
        const { files } = parseAIResponse(lastMsg.content);
        if (files.length > 0) {
          setWorkspaceFiles(files);
          setActiveFile(files[0]);
          setShowWorkspace(true);
          confetti({ particleCount: 80, spread: 80, origin: { x: 0.75, y: 0.5 } });
        }
      }
    } catch (err) {
      console.error('Error sending message:', err);
      // Remove temp user message or show error
      alert('Failed to send message. Please ensure your backend is running.');
    } finally {
      setLoading(false);
    }
  };

  // 3. PRESETS API CALLS
  const fetchPresets = async () => {
    setPresetsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/presets/`);
      const data = await res.json();
      setPresets(data);
    } catch (err) {
      console.error('Error fetching presets:', err);
    } finally {
      setPresetsLoading(false);
    }
  };

  const handleUsePreset = (templatePrompt) => {
    setActiveTab('chat');
    setInputValue(templatePrompt);
    handleSendMessage(templatePrompt);
  };

  // 4. SNIPPET VAULT API CALLS
  const fetchSnippets = async () => {
    setVaultLoading(true);
    try {
      const url = new URL(`${API_BASE}/snippets/`);
      if (vaultSearch) url.searchParams.append('q', vaultSearch);
      if (vaultFilterLang) url.searchParams.append('lang', vaultFilterLang);
      
      const res = await fetch(url);
      const data = await res.json();
      setSnippets(data);
    } catch (err) {
      console.error('Error fetching snippets:', err);
    } finally {
      setVaultLoading(false);
    }
  };

  // Trigger search when search query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSnippets();
    }, 300);
    return () => clearTimeout(timer);
  }, [vaultSearch, vaultFilterLang]);

  const handleSaveToVault = async (title, language, code, explanation = '', pathKey = null) => {
    try {
      const res = await fetch(`${API_BASE}/snippets/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, language, code, explanation, tags: language })
      });
      if (res.ok) {
        fetchSnippets();
        if (pathKey) {
          setSavedFilesStatus(prev => ({ ...prev, [pathKey]: true }));
          setTimeout(() => {
            setSavedFilesStatus(prev => ({ ...prev, [pathKey]: false }));
          }, 3000);
        }
        confetti({ particleCount: 40, colors: ['#EC4899', '#818CF8'] });
      }
    } catch (err) {
      console.error('Error saving snippet:', err);
    }
  };

  const handleDeleteSnippet = async (id) => {
    if (!confirm('Delete this code snippet from vault?')) return;
    try {
      await fetch(`${API_BASE}/snippets/${id}/`, { method: 'DELETE' });
      setSnippets(snippets.filter(s => s.id !== id));
      if (editingSnippet && editingSnippet.id === id) {
        setEditingSnippet(null);
      }
    } catch (err) {
      console.error('Error deleting snippet:', err);
    }
  };

  // 5. HELPER PARSING & FILE UTILITIES
  const parseAIResponse = (text) => {
    const files = [];
    // Regular expression to extract ### FILE: filepath followed by a codeblock
    const fileRegex = /### FILE:\s*([^\n]+)\s*\n```(\w*)\n([\s\S]*?)```/g;
    let match;
    let cleanedContent = text;
    
    while ((match = fileRegex.exec(text)) !== null) {
      const filePath = match[1].trim();
      const language = match[2].trim() || 'javascript';
      const code = match[3];
      const fileName = filePath.split('/').pop();
      
      files.push({
        path: filePath,
        name: fileName,
        language: language,
        code: code
      });
    }

    // Clean up content so we don't display massive duplicate text in chat bubbles
    cleanedContent = text.replace(/### FILE:\s*([^\n]+)\s*\n```(\w*)\n([\s\S]*?)```/g, (m, filePath) => {
      return `\n> 📁 **Interactive Project File: [${filePath.trim()}]** (Available in workspace viewer)\n`;
    });
    
    return { files, cleanedContent };
  };

  const handleCopyCode = (code, label = 'file') => {
    navigator.clipboard.writeText(code);
    setCopiedFile(label);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownloadFile = (fileName, code) => {
    const element = document.createElement("a");
    const file = new Blob([code], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const getFrameworkIcon = (framework) => {
    switch (framework.toLowerCase()) {
      case 'springboot': return '🍃';
      case 'django': return '🐍';
      case 'react': return '⚛️';
      case 'js': return '🟨';
      case 'mongodb': return '🍃';
      case 'sql': return '🗄️';
      case 'java': return '☕';
      case 'python': return '🐍';
      default: return '💻';
    }
  };

  return (
    <div className="app-container">
      {/* SIDEBAR PANEL */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon">
            <Bot size={22} />
          </div>
          <span className="logo-text">CHATBOTAI </span>
        </div>

        <button className="new-chat-btn" onClick={handleCreateSession}>
          <Plus size={18} />
          <span>New Workspace</span>
        </button>

        <nav className="nav-links">
          <button 
            className={`nav-item ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            <Terminal size={18} />
            <span>AI Code Workspace</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'presets' ? 'active' : ''}`}
            onClick={() => { setActiveTab('presets'); fetchPresets(); }}
          >
            <Sparkles size={18} />
            <span>Preset Projects</span>
          </button>
          <button 
            className={`nav-item ${activeTab === 'vault' ? 'active' : ''}`}
            onClick={() => { setActiveTab('vault'); fetchSnippets(); }}
          >
            <Database size={18} />
            <span>Saved Code Vault</span>
          </button>
        </nav>

        <div className="session-list-container">
          <span className="session-section-title">Recent Chats</span>
          {sessions.map(s => (
            <div 
              key={s.id} 
              className={`session-item ${activeSessionId === s.id && activeTab === 'chat' ? 'active' : ''}`}
              onClick={() => handleSelectSession(s.id)}
            >
              <span className="session-item-title">{s.title}</span>
              <div className="session-actions">
                <button 
                  className="action-btn delete"
                  onClick={(e) => handleDeleteSession(e, s.id)}
                >
                  <Trash size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">AC</div>
            <div className="user-info">
              <span className="username">Developer</span>
              <span className="user-role">Premium Architect</span>
            </div>
          </div>
          <button className="action-btn" onClick={() => setShowSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </aside>

      {/* MAIN VIEW AREA */}
      <main className="main-panel">
        <header className="panel-header">
          <div className="panel-title">
            {activeTab === 'chat' && (activeSession ? activeSession.title : 'AI Chatbot Workspace')}
            {activeTab === 'presets' && 'Tough Preset Templates'}
            {activeTab === 'vault' && 'Code Snippet Vault'}
          </div>
          <div className="header-actions">
            {activeTab === 'chat' && workspaceFiles.length > 0 && (
              <button 
                className="header-btn"
                onClick={() => setShowWorkspace(!showWorkspace)}
              >
                <Code size={16} />
                <span>{showWorkspace ? 'Hide Workspace' : 'Show Workspace'}</span>
              </button>
            )}
            <button className="header-btn" onClick={() => setShowSettings(true)}>
              <Sliders size={16} />
              <span>Model Config</span>
            </button>
          </div>
        </header>

        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <>
            {!activeSession || activeSession.messages.length === 0 ? (
              <div className="welcome-container">
                <h1 className="welcome-title"> CHATBOTWORKSPACE</h1>
                <p className="welcome-subtitle">
                  Generate production-ready code for complex systems. Ask any tough database routing, 
                  JWT Auth filter, Webhook handler, React Virtualized scroll, or priority scheduling tasks in 
                  Spring Boot, Django, React, JS, MongoDB, SQL, Java, and Python.
                </p>

                <div className="frameworks-grid">
                  {['Spring Boot', 'Django', 'React.js', 'JS / TS', 'MongoDB', 'SQL', 'Java', 'Python'].map((fw, idx) => (
                    <div 
                      key={fw} 
                      className="framework-card"
                      onClick={() => handleUsePreset(
                        `Write a comprehensive, professional ${fw} project for a tough, advanced production feature with multi-file structures.`
                      )}
                    >
                      <span className="framework-icon">{getFrameworkIcon(fw)}</span>
                      <span className="framework-name">{fw}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="messages-feed">
                {activeSession.messages.map((msg, idx) => {
                  const isUser = msg.role === 'user';
                  const { files, cleanedContent } = isUser ? { files: [], cleanedContent: msg.content } : parseAIResponse(msg.content);
                  
                  return (
                    <div key={msg.id || idx} className={`message-bubble ${msg.role}`}>
                      <div className="message-avatar">
                        {isUser ? '👤' : <Bot size={18} />}
                      </div>
                      <div className="message-content-wrapper">
                        <span className="message-sender">{isUser ? 'User' : 'Antigravity Architect'}</span>
                        <div 
                          className="message-text"
                          dangerouslySetInnerHTML={renderMarkdown(cleanedContent)}
                        />
                        {files.length > 0 && (
                          <div className="message-files-attached">
                            <button 
                              className="file-viewer-badge"
                              onClick={() => {
                                setWorkspaceFiles(files);
                                setActiveFile(files[0]);
                                setShowWorkspace(true);
                              }}
                            >
                              <Folder size={14} />
                              <span>Explore Code Workspace ({files.length} files)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {loading && (
                  <div className="message-bubble assistant">
                    <div className="message-avatar">
                      <Bot size={18} />
                    </div>
                    <div className="message-content-wrapper">
                      <span className="message-sender">Architect thinking...</span>
                      <div className="message-text" style={{ padding: '10px 14px' }}>
                        <span className="pulse-glow" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', marginRight: '6px' }}></span>
                        Generating complex project structure and production files...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            <div className="input-panel">
              <div className="preset-pills-row">
                <button 
                  className="preset-pill"
                  onClick={() => setInputValue("Create a Spring Boot JWT Authentication filter and security configurations.")}
                >
                  🔑 Spring Boot JWT Auth
                </button>
                <button 
                  className="preset-pill"
                  onClick={() => setInputValue("Create a Django custom middleware for host-based multi-tenant routing.")}
                >
                  🌐 Django Multi-Tenancy
                </button>
                <button 
                  className="preset-pill"
                  onClick={() => setInputValue("Write a complex SQL window function for cohort analysis.")}
                >
                  📈 SQL cohort retention
                </button>
                <button 
                  className="preset-pill"
                  onClick={() => setInputValue("Create a custom priority task scheduler pool in Java.")}
                >
                  ⚡ Java priority thread pool
                </button>
              </div>
              <div className="input-container">
                <textarea
                  className="chat-input"
                  rows="1"
                  placeholder="Describe your tough software architecture requirement..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <div className="input-actions">
                  <button 
                    className="send-btn"
                    onClick={() => handleSendMessage()}
                    disabled={loading || !inputValue.trim()}
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* PRESET PROJECTS TAB */}
        {activeTab === 'presets' && (
          <div className="content-area-wrapper">
            <div className="section-header">
              <h2 className="section-title">Production Boilerplates</h2>
              <p className="section-subtitle">Pick a difficult core project boilerplate and generate multi-file structures instantly.</p>
            </div>
            {presetsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading blueprints...</div>
            ) : (
              <div className="presets-detailed-grid">
                {presets.map(p => (
                  <div key={p.id} className="preset-detail-card">
                    <div className="card-top">
                      <div className="badge-row">
                        <span className="badge framework">{p.framework}</span>
                        <span className="badge complexity">{p.complexity}</span>
                      </div>
                      <h3 className="preset-card-title">{p.name}</h3>
                      <p className="preset-card-desc">{p.description}</p>
                    </div>
                    <button 
                      className="preset-card-btn"
                      onClick={() => handleUsePreset(p.prompt_template)}
                    >
                      <Sparkles size={14} />
                      <span>Generate Project</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VAULT TAB */}
        {activeTab === 'vault' && (
          <div className="content-area-wrapper">
            <div className="section-header">
              <h2 className="section-title">Code Snippet Vault</h2>
              <p className="section-subtitle">Manage, view, and export your saved complex structures.</p>
            </div>

            <div className="vault-search-row">
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input 
                  type="text" 
                  className="vault-search-input" 
                  style={{ paddingLeft: '40px' }}
                  placeholder="Search code vault by title or tags..."
                  value={vaultSearch}
                  onChange={(e) => setVaultSearch(e.target.value)}
                />
              </div>
              <select 
                className="form-select"
                value={vaultFilterLang}
                onChange={(e) => setVaultFilterLang(e.target.value)}
              >
                <option value="">All Languages</option>
                <option value="java">Java</option>
                <option value="python">Python</option>
                <option value="javascript">JavaScript</option>
                <option value="django">Django</option>
                <option value="sql">SQL</option>
                <option value="mongodb">MongoDB</option>
              </select>
            </div>

            {vaultLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>Loading Vault...</div>
            ) : snippets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)' }}>
                No snippets found. Save files from the Code Workspace to store them in your database vault!
              </div>
            ) : (
              <div className="snippets-grid">
                {snippets.map(s => (
                  <div key={s.id} className="snippet-card">
                    <div>
                      <h3 className="snippet-title">{s.title}</h3>
                      <div className="snippet-lang-tag">{s.language.toUpperCase()}</div>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {s.explanation || 'No explanation saved.'}
                      </p>
                    </div>
                    <div className="snippet-meta">
                      <span>{new Date(s.created_at).toLocaleDateString()}</span>
                      <div className="snippet-card-actions">
                        <button 
                          className="action-btn"
                          onClick={() => {
                            setEditingSnippet(s);
                            // Open in workspace
                            setWorkspaceFiles([{ name: s.title, path: s.title, code: s.code, language: s.language }]);
                            setActiveFile({ name: s.title, path: s.title, code: s.code, language: s.language });
                            setShowWorkspace(true);
                            setActiveTab('chat');
                          }}
                        >
                          <Eye size={14} />
                        </button>
                        <button 
                          className="action-btn delete"
                          onClick={() => handleDeleteSnippet(s.id)}
                        >
                          <Trash size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CODE WORKSPACE PANEL (IDE VIEW) */}
      {showWorkspace && workspaceFiles.length > 0 && (
        <section className="workspace-panel">
          <div className="workspace-header">
            <div className="workspace-title-wrapper">
              <Terminal size={16} style={{ color: 'var(--primary-light)' }} />
              <span>Workspace Files</span>
            </div>
            <button className="action-btn" onClick={() => setShowWorkspace(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="workspace-body">
            {/* File list tree */}
            <div className="file-explorer">
              <div className="explorer-header">Project Tree</div>
              {workspaceFiles.map(f => (
                <div 
                  key={f.path} 
                  className={`tree-node ${activeFile?.path === f.path ? 'active' : ''}`}
                  onClick={() => setActiveFile(f)}
                >
                  <FileCode size={14} />
                  <span>{f.path}</span>
                </div>
              ))}
            </div>
            
            {/* Code viewport */}
            <div className="code-editor-container">
              <div className="editor-header-bar">
                <span className="active-filename">{activeFile?.path}</span>
                <div className="editor-actions">
                  <button 
                    className="editor-btn" 
                    title="Copy File Code"
                    onClick={() => handleCopyCode(activeFile?.code, activeFile?.path)}
                  >
                    {copiedFile === activeFile?.path ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                  </button>
                  <button 
                    className="editor-btn" 
                    title="Save Snippet to Database Vault"
                    onClick={() => handleSaveToVault(
                      activeFile?.name || 'FileSnippet', 
                      activeFile?.language || 'txt', 
                      activeFile?.code || '',
                      `Extracted from AI workspace file path: ${activeFile?.path}`,
                      activeFile?.path
                    )}
                  >
                    {savedFilesStatus[activeFile?.path] ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Save size={14} />}
                  </button>
                  <button 
                    className="editor-btn" 
                    title="Download File"
                    onClick={() => handleDownloadFile(activeFile?.name, activeFile?.code)}
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
              <pre className="code-viewer-pre">
                <code>{activeFile?.code}</code>
              </pre>
            </div>
          </div>
        </section>
      )}

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="settings-overlay">
          <div className="settings-modal">
            <button className="settings-close" onClick={() => setShowSettings(false)}>
              <X size={18} />
            </button>
            <h2 className="settings-title">Model Configuration</h2>
            <div className="settings-form">
              <div className="form-group">
                <label className="form-label">
                  Gemini API Key 
                  <span style={{ marginLeft: '8px' }} className={`api-key-badge ${settings.geminiKey ? 'configured' : 'missing'}`}>
                    {settings.geminiKey ? 'CONNECTED' : 'KEY MISSING'}
                  </span>
                </label>
                <input 
                  type="password" 
                  className="form-input" 
                  placeholder="Paste your Gemini API key here..."
                  value={settings.geminiKey}
                  onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Get a free key from Google AI Studio. Your key is stored locally in your browser.
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">AI Model</label>
                <select 
                  className="form-select"
                  value={settings.model}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast, Code-optimized)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Deep reasoning, complex architectures)</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Legacy)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Temperature (Creative limits): {settings.temperature}</label>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1" 
                  value={settings.temperature}
                  onChange={(e) => setSettings({ ...settings, temperature: e.target.value })}
                />
              </div>
              <button 
                className="settings-save-btn"
                onClick={() => handleSaveSettings(settings)}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
