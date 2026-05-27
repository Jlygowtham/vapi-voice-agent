'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from './page.module.css';

export default function Home() {
  // Call States
  const [isCallActive, setIsCallActive] = useState(false);
  const [callStatus, setCallStatus] = useState('idle'); // 'idle' | 'connecting' | 'active' | 'speaking' | 'listening'
  const [volume, setVolume] = useState(0);
  const [transcripts, setTranscripts] = useState([]);
  // Tracks the live partial (non-final) transcript being streamed right now
  const [partialTranscript, setPartialTranscript] = useState(null);
  
  // Dialer States
  const [phone, setPhone] = useState('');
  const [isDialing, setIsDialing] = useState(false);
  const [dialStatus, setDialStatus] = useState('');

  // Database States
  const [registrations, setRegistrations] = useState([]);
  const [isLoadingRegs, setIsLoadingRegs] = useState(true);
  const [selectedRegForTranscript, setSelectedRegForTranscript] = useState(null);

  // Bottom Sheet Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Call Duration & Timestamp States
  const [callDuration, setCallDuration] = useState(0);
  const [lastCallTime, setLastCallTime] = useState(null);
  const timerRef = useRef(null);

  // Refs for tracking values inside mounting useEffect closure
  const transcriptsRef = useRef([]);
  const durationRef = useRef(0);
  const callIdRef = useRef(null);

  // Sync refs to state changes
  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  useEffect(() => {
    durationRef.current = callDuration;
  }, [callDuration]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Fetch registrations from API
  const fetchRegistrations = useCallback(async () => {
    try {
      const res = await fetch('/api/registrations');
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data.registrations || []);
      }
    } catch (e) {
      console.error('Error fetching registrations:', e);
    } finally {
      setIsLoadingRegs(false);
    }
  }, []);

  // Poll registrations only when the drawer is open to save CPU/network overhead
  useEffect(() => {
    let interval;
    if (isDrawerOpen) {
      // Defer state update asynchronously to satisfy React 19/ESLint rules
      setTimeout(fetchRegistrations, 0); 
      interval = setInterval(fetchRegistrations, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isDrawerOpen, fetchRegistrations]);

  // Save the conversation transcript to database
  const saveConversationLog = useCallback(async (callId, finalTranscripts, duration) => {
    try {
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          name: 'Monica & Guest',
          email: '-',
          phone: '-',
          class_name: 'Chat Only',
          timeslot: '-',
          transcripts: finalTranscripts,
          duration,
          createdAt: new Date().toISOString(),
          source: 'webCall'
        })
      });
      if (res.ok) {
        fetchRegistrations();
      }
    } catch (e) {
      console.error('Failed to auto-save conversation log:', e);
    }
  }, [fetchRegistrations]);

  // Vapi Ref
  const vapiRef = useRef(null);
  const transcriptContainerRef = useRef(null);
  // Stable ref to saveConversationLog — avoids re-creating the Vapi SDK instance
  const saveConversationLogRef = useRef(null);

  // Keep the ref synced with the latest version of saveConversationLog
  useEffect(() => {
    saveConversationLogRef.current = saveConversationLog;
  }, [saveConversationLog]);

  // Load Vapi Web SDK on client side only
  useEffect(() => {
    // Dynamic import to prevent Next.js SSR error
    import('@vapi-ai/web').then((module) => {
      const Vapi = module.default;
      const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY || 'your-public-key-fallback';
      
      const vapiInstance = new Vapi(publicKey);
      vapiRef.current = vapiInstance;

      // Event Listeners
      vapiInstance.on('call-start', () => {
        setIsCallActive(true);
        setCallStatus('active');
        setTranscripts([]);
        setPartialTranscript(null);
        setCallDuration(0);
        
        // Start duration timer
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);

        console.log('Call started successfully');
      });

      vapiInstance.on('call-end', () => {
        setIsCallActive(true); // Keep the workspace active so they can read subtitles
        setCallStatus('ended');
        setVolume(0);
        setPartialTranscript(null);
        console.log('Call ended');

        // Stop duration timer and record last call time
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        setLastCallTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));

        // POST the conversation log to save transcripts — use ref to avoid stale closure
        const finalTranscripts = transcriptsRef.current;
        const duration = durationRef.current;
        const callId = callIdRef.current || 'local-' + Math.random().toString(36).substring(7);

        if (saveConversationLogRef.current) {
          saveConversationLogRef.current(callId, finalTranscripts, duration);
        }
      });

      vapiInstance.on('speech-start', () => {
        // Guard: don't overwrite 'ended' status if call-end already fired
        setCallStatus((prev) => prev === 'ended' ? 'ended' : 'speaking');
      });

      vapiInstance.on('speech-end', () => {
        // Guard: don't overwrite 'ended' status if call-end already fired
        setCallStatus((prev) => prev === 'ended' ? 'ended' : 'listening');
      });

      vapiInstance.on('volume-level', (level) => {
        // Guard: don't update volume after call ends
        setCallStatus((prev) => {
          if (prev !== 'ended') setVolume(level);
          return prev;
        });
      });

      vapiInstance.on('message', (message) => {
        console.log('Vapi Message received:', message);
        
        // Handle in-call transcripts
        if (message.type === 'transcript') {
          const role = message.role === 'assistant' ? 'Monica' : 'You';
          const text = message.transcript;
          const isFinal = message.transcriptType === 'final';

          if (isFinal) {
            // Commit the finalized sentence permanently into the transcripts list
            // and clear the partial tracker so the next partial starts fresh
            setTranscripts((prev) => [...prev, { role, text, isFinal: true }]);
            setPartialTranscript(null);
          } else {
            // Update only the live partial — never mutate the finalized list
            setPartialTranscript({ role, text, isFinal: false });
          }
        }
      });

      vapiInstance.on('error', (e) => {
        console.error('Vapi Web SDK Error:', e);
        setIsCallActive(false);
        setCallStatus('idle');
        setVolume(0);
      });
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []); // Empty deps — Vapi SDK must only be initialized ONCE. Use refs for callbacks.

  // Scroll transcript window to bottom on every change (final or partial) to prevent getting stuck
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcripts, partialTranscript]);

  // Toggle Web Call
  const toggleCall = async () => {
    if (!vapiRef.current) return;

    if (isCallActive && callStatus !== 'ended') {
      // ── ENDING CALL ──────────────────────────────────────────────────────────
      // Immediately update UI so the button feels responsive.
      // Don't wait for the call-end event — it can arrive late or not at all.
      setCallStatus('ended');
      setIsCallActive(true);
      setVolume(0);
      setPartialTranscript(null);

      // Stop the timer right now
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setLastCallTime(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );

      // Save the transcript immediately (don't rely on call-end firing)
      const finalTranscripts = transcriptsRef.current;
      const duration = durationRef.current;
      const callId = callIdRef.current || 'local-' + Math.random().toString(36).substring(7);
      if (saveConversationLogRef.current) {
        saveConversationLogRef.current(callId, finalTranscripts, duration);
      }

      // Tell Vapi to actually stop the connection (in background)
      try {
        vapiRef.current.stop();
      } catch (e) {
        console.error('Error stopping Vapi:', e);
      }
    } else {
      setTranscripts([]);
      setPartialTranscript(null);
      setCallDuration(0);
      setCallStatus('connecting');
      setIsCallActive(true);
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID || '6cee1a72-ba5c-4239-a8d4-a0cd30b2b547';
      try {
        const call = await vapiRef.current.start(assistantId);
        if (call) {
          callIdRef.current = call.id;
        }
      } catch (err) {
        console.error('Failed to start call:', err);
        setCallStatus('idle');
        setIsCallActive(false);
      }
    }
  };

  // Trigger Outbound Twilio Call
  const handleOutboundCall = async (e) => {
    e.preventDefault();
    if (!phone) return;

    setIsDialing(true);
    setDialStatus('Initiating phone call...');

    try {
      const res = await fetch('/api/outbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();

      if (res.ok) {
        setDialStatus('Call triggered! Check your phone.');
        setPhone('');
        setTimeout(() => setDialStatus(''), 5000);
      } else {
        setDialStatus(`Error: ${data.error || 'Failed to connect call'}`);
      }
    } catch (err) {
      setDialStatus('Error connecting to the outbound dialer API.');
    } finally {
      setIsDialing(false);
    }
  };

  // Clear all registrations
  const clearAllRegistrations = async () => {
    if (!confirm('Are you sure you want to clear all registration logs?')) return;
    try {
      const res = await fetch('/api/registrations', { method: 'DELETE' });
      if (res.ok) {
        fetchRegistrations();
      }
    } catch (e) {
      console.error('Failed to clear registrations:', e);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        
        {/* Floating Header */}
        <header className={styles.header}>
          <div className={styles.brandInfo}>
            <h1>TechLearn Academy</h1>
            <p>Voice Agent Enrollment</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.statusIndicator}>
              <div className={`${styles.statusDot} ${isCallActive ? styles.statusDotActive : ''}`}></div>
              <span>{isCallActive ? 'Monica Online' : 'Agent Ready'}</span>
            </div>
            
            <button 
              onClick={() => setIsDrawerOpen(true)} 
              className={styles.drawerTriggerBtn}
              title="Open Student Records & Course Catalog"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              View Records & Catalog
            </button>
          </div>
        </header>

        {/* Focus Mode Workspace */}
        <main className={`${styles.workspace} ${isCallActive ? styles.workspaceCallActive : ''}`}>
          {!isCallActive ? (
            // Idle State: Clean focus welcome page with Outbound Dialer directly below Focus Sphere
            <div className={styles.idleWorkspace}>
              <div className={styles.welcomeBlock}>
                <h2>Conversational AI Assistant</h2>
                <h1>Talk with Monica</h1>
                <p>
                  Experience natural voice registration. Monica will guide you through choosing technical courses, picking timeslots, and saving your data instantly.
                </p>
              </div>

              <div className={styles.focusSphereContainer}>
                {/* Visual rings reacting to standby mode */}
                <div className={styles.focusRings}></div>
                <div className={styles.focusRingsTwo}></div>
                
                <button 
                  onClick={toggleCall}
                  className={styles.focusSphereButton}
                  disabled={callStatus === 'connecting'}
                  title="Call Monica"
                >
                  {callStatus === 'connecting' ? (
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={styles.spinner}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                    </svg>
                  ) : (
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                      <line x1="12" y1="19" y2="22"></line>
                    </svg>
                  )}
                </button>
              </div>
              
              <span className={styles.sphereStatusPrompt}>
                {callStatus === 'connecting' ? 'Connecting to Audio Network...' : 'Tap the mic to talk in browser'}
              </span>

              {/* Dialer form directly below the voice agent Focus Sphere */}
              <div className={styles.mainDialerArea}>
                <div className={styles.mainDialerDivider}>
                  <span>or receive a phone call</span>
                </div>
                
                <form onSubmit={handleOutboundCall} className={styles.mainDialerForm}>
                  <div className={styles.mainDialerInputWrapper}>
                    <input 
                      type="tel" 
                      placeholder="Enter phone number: +1 234 567 8900" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)} 
                      className={styles.mainDialerInput}
                      required
                    />
                    <button 
                      type="submit" 
                      disabled={isDialing || isCallActive} 
                      className={styles.mainDialerBtn}
                    >
                      {isDialing ? 'Calling...' : 'Call Me'}
                    </button>
                  </div>
                  {dialStatus && (
                    <p style={{ fontSize: '0.85rem', color: dialStatus.includes('Error') ? '#f87171' : '#34d399', marginTop: '0.5rem', fontWeight: 600 }}>
                      {dialStatus}
                    </p>
                  )}
                </form>
              </div>
              
              {lastCallTime && (
                <span className={styles.sphereLastCall}>Last conversation ended at {lastCallTime}</span>
              )}
            </div>
          ) : (
            // In-Call Focus State: Large subtitle layout
            <div className={styles.activeWorkspace}>
              {/* Left Column: Active Visualizer */}
              <div className={styles.activeVisualizerPanel}>
                <div className={styles.activeSphereArea}>
                  {callStatus !== 'ended' ? (
                    <>
                      <div className={styles.activeAudioRings} style={{ transform: `scale(${1 + volume * 0.7})`, opacity: 0.6 }}></div>
                      <div className={styles.activeAudioRingsSecondary} style={{ transform: `scale(${1 + volume * 1.3})`, opacity: 0.3 }}></div>
                      
                      <button 
                        onClick={toggleCall}
                        className={styles.activeSphereButton}
                        title="End Call"
                      >
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <rect x="3" y="11" width="18" height="2" rx="1"></rect>
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button 
                      onClick={toggleCall}
                      className={styles.endedSphereButton}
                      title="Start New Call"
                    >
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                        <line x1="12" y1="19" y2="22"></line>
                      </svg>
                    </button>
                  )}
                </div>

                <div className={styles.activeCallMeta}>
                  {callStatus === 'ended' ? (
                    <span className={styles.endedCallStatus}>
                      Call Ended
                    </span>
                  ) : (
                    <span className={`${styles.activeCallStatus} ${callStatus === 'speaking' ? styles.callSpeakingColor : ''}`}>
                      {callStatus === 'speaking' ? 'Monica is speaking' : 'Listening to you'}
                    </span>
                  )}
                  <span className={styles.activeDurationBadge}>
                    • {formatDuration(callDuration)}
                  </span>
                </div>

                {callStatus !== 'ended' ? (
                  <div className={styles.visualizerWave}>
                    {[...Array(11)].map((_, i) => {
                      const factor = 1 - Math.abs(i - 5) * 0.16;
                      const height = Math.max(6, volume * 120 * factor);
                      return (
                        <div 
                          key={i} 
                          className={styles.waveBar} 
                          style={{ height: `${height}px` }}
                        ></div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column', width: '100%', alignItems: 'center' }}>
                    <button
                      onClick={() => setIsDrawerOpen(true)}
                      className={styles.viewLogsBtn}
                      title="Open Records & Call History"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                      </svg>
                      View Call History
                    </button>

                    <button
                      onClick={() => {
                        setIsCallActive(false);
                        setCallStatus('idle');
                        setTranscripts([]);
                        setPartialTranscript(null);
                      }}
                      className={styles.backHomeBtn}
                      title="Go Back to Home Screen"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      Go Back to Home
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Large High-Readability Transcripts */}
              <div className={styles.activeSubtitlePanel}>
                <div className={styles.subtitleTitle}>Conversation Subtitles</div>
                <div ref={transcriptContainerRef} className={styles.subtitleScrollBox}>
                  {transcripts.length === 0 && !partialTranscript ? (
                    <div className={styles.subtitleEmpty}>
                      Connected — Monica will speak shortly. Start talking whenever you&apos;re ready.
                    </div>
                  ) : (
                    <>
                      {transcripts.map((msg, index) => (
                        <div key={index} className={msg.role === 'Monica' ? styles.subAgent : styles.subUser}>
                          <span className={msg.role === 'Monica' ? styles.subRoleAgent : styles.subRoleUser}>
                            {msg.role === 'Monica' ? 'Monica' : 'You'}
                          </span>
                          <p className={styles.subText}>{msg.text}</p>
                        </div>
                      ))}
                      {/* Live partial transcript streamed in real-time */}
                      {partialTranscript && (
                        <div className={partialTranscript.role === 'Monica' ? styles.subAgent : styles.subUser}>
                          <span className={partialTranscript.role === 'Monica' ? styles.subRoleAgent : styles.subRoleUser}>
                            {partialTranscript.role === 'Monica' ? 'Monica' : 'You'}
                          </span>
                          <p className={`${styles.subText} ${styles.subTextPartial}`}>{partialTranscript.text}</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>

        {/* Dimmer Backdrop Overlay */}
        <div 
          className={`${styles.backdrop} ${isDrawerOpen ? styles.backdropActive : ''}`} 
          onClick={() => setIsDrawerOpen(false)}
        ></div>

        {/* Slide-Up Bottom Drawer Sheet */}
        <div className={`${styles.bottomDrawer} ${isDrawerOpen ? styles.bottomDrawerOpen : ''}`}>
          <div className={styles.drawerHeader}>
            <div className={styles.drawerHeaderTitle}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '8px' }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Academy Catalog & Student Records
            </div>
            
            <div className={styles.drawerHeaderActions}>
              <button 
                onClick={() => setIsDrawerOpen(false)}
                className={styles.drawerCloseBtn}
                title="Close Drawer"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>

          <div className={styles.drawerHandle} onClick={() => setIsDrawerOpen(false)} title="Close Drawer"></div>

          <div className={styles.drawerContentGrid}>
            
            {/* Left Panel: Available Courses Catalog */}
            <div className={styles.drawerLeftPanel}>
              <div className={styles.drawerSection}>
                <h2 className={styles.drawerSectionTitle}>Available Programs & Slots</h2>
                <p className={styles.drawerSectionDesc}>Provide Monica with your selected course and preferred timeslot during the call:</p>
                
                <div className={styles.drawerClassGrid}>
                  <div className={styles.drawerClassCard}>
                    <div className={styles.drawerClassName}>Python Programming</div>
                    <div className={styles.drawerClassSlots}>
                      <span>10 AM</span>
                      <span>2 PM</span>
                      <span>6 PM</span>
                    </div>
                  </div>
                  
                  <div className={styles.drawerClassCard}>
                    <div className={styles.drawerClassName}>Generative AI</div>
                    <div className={styles.drawerClassSlots}>
                      <span>10 AM</span>
                      <span>2 PM</span>
                      <span>6 PM</span>
                    </div>
                  </div>

                  <div className={styles.drawerClassCard}>
                    <div className={styles.drawerClassName}>Agentic AI</div>
                    <div className={styles.drawerClassSlots}>
                      <span>10 AM</span>
                      <span>2 PM</span>
                      <span>6 PM</span>
                    </div>
                  </div>

                  <div className={styles.drawerClassCard}>
                    <div className={styles.drawerClassName}>Cloud Computing</div>
                    <div className={styles.drawerClassSlots}>
                      <span>10 AM</span>
                      <span>2 PM</span>
                      <span>6 PM</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* About Section explaining what this application is and what it can do */}
              <div className={styles.drawerSection} style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '1.5rem' }}>
                <h2 className={styles.drawerSectionTitle}>About This Application</h2>
                <p className={styles.drawerSectionDesc} style={{ marginBottom: '1.25rem' }}>
                  This application is a live developer playground and synchronous enrollment dashboard designed for Monica, our advanced Conversational Voice Agent.
                </p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(129, 140, 248, 0.1)', color: '#818cf8', padding: '0.45rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>Real-Time Voice Assistant</h3>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                        Talk directly to Monica in your web browser or trigger an outbound Twilio phone call to complete your course registration.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(192, 132, 252, 0.1)', color: '#c084fc', padding: '0.45rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                      </svg>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>Dynamic Serverless Webhooks</h3>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                        During the call, Monica fires a background serverless webhook to log selected classes and timeslots dynamically.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                    <div style={{ background: 'rgba(52, 211, 153, 0.1)', color: '#34d399', padding: '0.45rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                        <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', marginBottom: '0.15rem' }}>State-Synchronized Database</h3>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', lineHeight: 1.4 }}>
                         Reservations are stored in a Vercel KV database and instantly rendered in the live log records on the right panel.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Panel: Live Logs Database Table */}
            <div className={styles.drawerRightPanel}>
              <div className={styles.drawerSection} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                
                <div className={styles.drawerTableHeader}>
                  <div>
                    <h2 className={styles.drawerSectionTitle} style={{ marginBottom: '0.15rem' }}>Live Enrollment Database Logs</h2>
                    <p className={styles.drawerSectionDesc}>Records written dynamically via Vapi server webhook callback:</p>
                  </div>
                  {registrations.length > 0 && (
                    <button onClick={clearAllRegistrations} className={styles.drawerClearBtn}>
                      Clear Logs
                    </button>
                  )}
                </div>

                <div className={styles.drawerTableContainer}>
                  {isLoadingRegs ? (
                    <div className={styles.drawerEmptyState}>Loading registrations database...</div>
                  ) : registrations.length === 0 ? (
                    <div className={styles.drawerEmptyState}>
                      No records logged yet. Complete a voice call with Monica to see entries populate here!
                    </div>
                  ) : (
                    <table className={styles.drawerTable}>
                      <thead>
                        <tr>
                          <th>Student Name</th>
                          <th>Email Address</th>
                          <th>Phone Number</th>
                          <th>Course</th>
                          <th>Slot</th>
                          <th>Channel</th>
                          <th>Transcript</th>
                          <th>Enrolled At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {registrations.map((reg) => (
                          <tr key={reg.id}>
                            <td style={{ fontWeight: 700, color: '#fff' }}>{reg.name}</td>
                            <td>{reg.email}</td>
                            <td>{reg.phone}</td>
                            <td style={{ color: '#a5b4fc', fontWeight: 600 }}>{reg.class_name}</td>
                            <td>{reg.timeslot}</td>
                            <td>
                              <span className={`${styles.sourceBadge} ${reg.source === 'webCall' ? styles.sourceBadgeWeb : styles.sourceBadgePhone}`}>
                                {reg.source === 'webCall' ? 'Web sdk' : 'Phone'}
                              </span>
                            </td>
                            <td>
                              {(reg.transcript || (reg.transcripts && reg.transcripts.length > 0)) ? (
                                <button
                                  onClick={() => setSelectedRegForTranscript(reg)}
                                  className={styles.viewTranscriptBtn}
                                  title="View Full Call Subtitles"
                                >
                                  View Transcript
                                </button>
                              ) : (
                                <span style={{ color: '#4b5563', fontStyle: 'italic', fontSize: '0.8rem' }}>No audio</span>
                              )}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                              {new Date(reg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Conversation Transcript Modal Overlay */}
        {selectedRegForTranscript && (
          <div className={styles.modalBackdrop} onClick={() => setSelectedRegForTranscript(null)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div>
                  <h3>Conversation with {selectedRegForTranscript.name}</h3>
                  <p className={styles.modalSubHeader}>
                    Duration: {formatDuration(selectedRegForTranscript.duration || 0)} • {new Date(selectedRegForTranscript.createdAt).toLocaleString()}
                  </p>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => setSelectedRegForTranscript(null)} title="Close Modal">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div className={styles.modalBody}>
                {selectedRegForTranscript.summary && (
                  <div className={styles.modalSummaryBox}>
                    <strong>Call Summary</strong>
                    <p>{selectedRegForTranscript.summary}</p>
                  </div>
                )}

                <div className={styles.modalTranscriptBox}>
                  <strong>Transcript Log</strong>
                  <div className={styles.modalTranscriptList}>
                    {/* Handle string format from webhook report */}
                    {typeof selectedRegForTranscript.transcript === 'string' && selectedRegForTranscript.transcript ? (
                      selectedRegForTranscript.transcript.split('\n').map((line, idx) => {
                        if (!line.trim()) return null;
                        const isAgent = line.trim().startsWith('Monica:') || line.trim().startsWith('Assistant:') || line.trim().startsWith('Monica (Assistant):');
                        const speakerName = isAgent ? 'Monica' : 'You/Customer';
                        const text = line.replace(/^(Monica|Assistant|User|Customer|Monica \(Assistant\)):\s*/i, '');
                        return (
                          <div key={idx} className={isAgent ? styles.modalLineAgent : styles.modalLineUser}>
                            <span className={isAgent ? styles.modalRoleAgent : styles.modalRoleUser}>
                              {speakerName}
                            </span>
                            <p className={styles.modalLineText}>{text}</p>
                          </div>
                        );
                      })
                    ) : selectedRegForTranscript.transcripts && selectedRegForTranscript.transcripts.length > 0 ? (
                      /* Handle array format from browser post */
                      selectedRegForTranscript.transcripts.map((msg, idx) => (
                        <div key={idx} className={msg.role === 'Monica' ? styles.modalLineAgent : styles.modalLineUser}>
                          <span className={msg.role === 'Monica' ? styles.modalRoleAgent : styles.modalRoleUser}>
                            {msg.role === 'Monica' ? 'Monica' : 'You'}
                          </span>
                          <p className={styles.modalLineText}>{msg.text}</p>
                        </div>
                      ))
                    ) : (
                      <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                        No transcripts recorded for this session.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
