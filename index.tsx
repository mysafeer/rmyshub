
import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  GoogleGenAI, 
  Modality, 
  LiveServerMessage,
  Type
} from "@google/genai";
import { 
  MessageSquare, 
  Sparkles, 
  Mic, 
  Image as ImageIcon, 
  FileText, 
  Search, 
  Globe, 
  Settings as SettingsIcon,
  Send,
  Loader2,
  X,
  Plus,
  Info,
  AlertCircle,
  RefreshCw,
  Zap,
  ChevronRight,
  Target,
  Users,
  Briefcase,
  MapPin,
  ArrowRightLeft,
  BookOpen,
  Volume2,
  PieChart,
  Calendar,
  PenTool,
  Filter,
  Building2,
  ChevronDown,
  Clock,
  PhoneCall,
  CheckCircle2,
  Trash2,
  Bell,
  VolumeX,
  BellRing,
  FileSearch,
  Scale,
  Ruler,
  FileCheck,
  Twitter,
  Instagram,
  Video,
  MessagesSquare,
  Facebook,
  Phone,
  Mail,
  HelpCircle,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// --- Global Utilities ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const parseAIError = (error: any): string => {
  const msg = error?.message?.toLowerCase() || "";
  if (msg.includes("api key") || msg.includes("401")) return "Auth Error: Invalid API Key.";
  if (msg.includes("429")) return "Rate Limit: Too many requests.";
  if (msg.includes("safety")) return "Safety Block: Content violates policy.";
  return `Error: ${error?.message || "Operation failed."}`;
};

// --- App Types ---

type MainSection = 'convertit' | 'dealcloser' | 'support' | 'settings';
type UtilityTool = 'tts' | 'story' | 'units' | 'images' | 'docs' | 'logo';

interface Lead {
  id: string;
  name: string;
  address: string;
  uri: string;
  details?: string;
}

interface FollowUp {
  id: string;
  leadId: string;
  leadName: string;
  date: string;
  time: string;
  type: 'manual' | 'automated_call';
  status: 'pending' | 'completed';
  alertTriggered?: boolean;
}

interface SupportMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: Date;
}

// --- Main Component ---

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState<MainSection>('dealcloser');
  const [activeTool, setActiveTool] = useState<UtilityTool | null>(null);
  
  // Generic Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState<string>('');
  const [imageOutput, setImageOutput] = useState<string | null>(null);
  
  // Converter States
  const [unitFrom, setUnitFrom] = useState('');
  const [unitTo, setUnitTo] = useState('');
  const [docFrom, setDocFrom] = useState('Word');
  const [docTo, setDocTo] = useState('PDF');

  // Deal Closer State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadIndustry, setLeadIndustry] = useState('');
  const [leadLocation, setLeadLocation] = useState('');
  const [leadSize, setLeadSize] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [brandLogo, setBrandLogo] = useState<string | null>(null);
  
  // Follow-up State
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [schedulingLead, setSchedulingLead] = useState<Lead | null>(null);
  const [followUpType, setFollowUpType] = useState<'manual' | 'automated_call'>('manual');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');

  // Support Chat State
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([
    { id: '1', role: 'ai', text: "Hello! Welcome to ConvertIt Support. How can I assist you today?", timestamp: new Date() }
  ]);
  const [supportInput, setSupportInput] = useState('');

  // Settings State
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reminderLeadTime, setReminderLeadTime] = useState(0);

  // Live API / Voice State
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);

  // --- Background Notification Engine ---
  useEffect(() => {
    const checkSchedule = () => {
      if (!notificationsEnabled) return;

      const now = new Date();
      setFollowUps(prev => {
        let changed = false;
        const next = prev.map(f => {
          if (f.status === 'completed' || f.alertTriggered) return f;

          const scheduleTime = new Date(`${f.date}T${f.time}`);
          const notifyTime = new Date(scheduleTime.getTime() - (reminderLeadTime * 60000));

          if (now >= notifyTime) {
            triggerNotification(f);
            changed = true;
            return { ...f, alertTriggered: true };
          }
          return f;
        });
        return changed ? next : prev;
      });
    };

    const triggerNotification = (f: FollowUp) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`Deal Closer: ${f.leadName}`, {
          body: `${f.type === 'automated_call' ? '📞 Automated Call' : '⏰ Manual Reminder'} scheduled now.`,
          icon: '/favicon.ico'
        });
      }

      if (soundEnabled) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(() => {});
      }
    };

    const interval = setInterval(checkSchedule, 10000);
    return () => clearInterval(interval);
  }, [followUps, notificationsEnabled, soundEnabled, reminderLeadTime]);

  const requestNotifyPermission = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      await Notification.requestPermission();
    }
  };

  // --- Fast AI Logic ---

  const handleFastResponse = async (userPrompt: string, isSupport = false) => {
    if (!isSupport) {
      setIsGenerating(true);
      setError(null);
    }
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const systemInstruction = isSupport ? "You are the official Support Agent for ConvertIt (convertit.space). You provide automated, helpful, and concise answers about conversions, deal closing tools, and branding. Our emails are contact@convertit.space and info@convertit.space. Socials: @convertit. Career: carrer@convertit.space. Meet: convertitspace@gmail.com. Be polite and professional." : undefined;
      
      const response = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: userPrompt,
        config: systemInstruction ? { systemInstruction } : undefined
      });
      
      if (isSupport) {
        const aiMsg: SupportMessage = {
          id: Math.random().toString(),
          role: 'ai',
          text: response.text || "I'm having trouble connecting to support right now.",
          timestamp: new Date()
        };
        setSupportMessages(prev => [...prev, aiMsg]);
      } else {
        setOutput(response.text || '');
      }
    } catch (e) {
      if (isSupport) {
        setSupportMessages(prev => [...prev, { id: 'err', role: 'ai', text: "Support system error. Please try again later.", timestamp: new Date() }]);
      } else {
        setError(parseAIError(e));
      }
    } finally {
      if (!isSupport) setIsGenerating(false);
    }
  };

  // --- Utility Tool Handlers ---

  const handleUnitConversion = () => {
    const conversionPrompt = `Convert ${prompt} ${unitFrom} to ${unitTo}. Provide a clear numerical answer with 4 decimal places if applicable.`;
    handleFastResponse(conversionPrompt);
  };

  const handleDocConversion = () => {
    const docPrompt = `Convert the following text content from ${docFrom} format to a ${docTo} style representation. If it's code, ensure syntax highlighting or proper structure: \n\n${prompt}`;
    handleFastResponse(docPrompt);
  };

  const handleTTS = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say naturally: ${prompt}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioCtx({ sampleRate: 24000 });
        const buffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      }
    } catch (e) {
      setError(parseAIError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStoryGen = async () => {
    if (!prompt.trim()) return;
    const storyPrompt = `Develop a professional script or story based on this idea: ${prompt}`;
    handleFastResponse(storyPrompt);
  };

  const handleLogoGen = async (customPrompt?: string) => {
    const finalPrompt = customPrompt || prompt;
    setIsGenerating(true);
    setError(null);
    setImageOutput(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `High-end professional luxury corporate logo for 'convertit.space'. The text 'convertit.space' MUST be the central, highly legible focus in premium modern typography. Aesthetic: Minimalist, futuristic, charcoal and liquid gold palette. Centered composition on a pure white background. ${finalPrompt}` }]
        },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const b64 = part.inlineData.data;
          const url = `data:${part.inlineData.mimeType};base64,${b64}`;
          if (customPrompt) {
            setBrandLogo(url);
          } else {
            setImageOutput(url);
          }
          break;
        }
      }
    } catch (e) {
      setError(parseAIError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const findLeads = async () => {
    if (!leadQuery.trim()) return;
    setIsGenerating(true);
    setError(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      let lat = 37.78193, lng = -122.40476;
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        });
      }
      const industryString = leadIndustry ? `in the ${leadIndustry} industry` : '';
      const locationString = leadLocation ? `specifically in ${leadLocation}` : 'in the current area';
      const sizeString = leadSize ? `with a company size of ${leadSize}` : '';
      const searchPrompt = `Find high-potential business leads for: ${leadQuery} ${industryString} ${locationString} ${sizeString}. Provide names and links.`;
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: searchPrompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } }
        },
      });
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const extractedLeads: Lead[] = [];
      chunks.forEach((c: any) => {
        if (c.maps) {
          extractedLeads.push({
            id: Math.random().toString(36).substr(2, 9),
            name: c.maps.title || "Potential Client",
            address: "Locating...",
            uri: c.maps.uri || "#"
          });
        }
      });
      setLeads(extractedLeads);
      setOutput(response.text || '');
      setShowFilters(false);
    } catch (e) {
      setError(parseAIError(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const scheduleFollowUp = () => {
    if (!schedulingLead || !followUpDate || !followUpTime) return;
    const newFollowUp: FollowUp = {
      id: Math.random().toString(36).substr(2, 9),
      leadId: schedulingLead.id,
      leadName: schedulingLead.name,
      date: followUpDate,
      time: followUpTime,
      type: followUpType,
      status: 'pending',
      alertTriggered: false
    };
    setFollowUps(prev => [...prev, newFollowUp]);
    setSchedulingLead(null);
    setFollowUpDate('');
    setFollowUpTime('');
  };

  const removeFollowUp = (id: string) => {
    setFollowUps(prev => prev.filter(f => f.id !== id));
  };

  const completeFollowUp = (id: string) => {
    setFollowUps(prev => prev.map(f => f.id === id ? { ...f, status: 'completed' } : f));
  };

  const startVoiceOutreach = async (targetLeadName?: string) => {
    if (isLiveActive) { stopVoiceOutreach(); return; }
    setIsLiveActive(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
      const inCtx = new AudioCtx({ sampleRate: 16000 });
      const outCtx = new AudioCtx({ sampleRate: 24000 });
      audioContextRef.current = inCtx;
      outputAudioContextRef.current = outCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            const source = inCtx.createMediaStreamSource(stream);
            const processor = inCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inCtx.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.outputTranscription) {
              setLiveTranscription(prev => prev + " " + msg.serverContent!.outputTranscription!.text);
            }
            const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audio) {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              const buffer = await decodeAudioData(decode(audio), outCtx, 24000, 1);
              const s = outCtx.createBufferSource();
              s.buffer = buffer;
              s.connect(outCtx.destination);
              s.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are a professional sales closer. You are calling ${targetLeadName || 'a potential client'}. Help pitch the service, handle objections, and secure a follow-up or closing action.`,
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      console.error(e);
      setIsLiveActive(false);
    }
  };

  const stopVoiceOutreach = () => {
    if (liveSessionRef.current) liveSessionRef.current.close();
    if (audioContextRef.current) audioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    setIsLiveActive(false);
    setLiveTranscription('');
  };

  function createBlob(data: Float32Array): { data: string; mimeType: string } {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: encode(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  const sendSupportChat = () => {
    if (!supportInput.trim()) return;
    const userMsg: SupportMessage = {
      id: Math.random().toString(),
      role: 'user',
      text: supportInput,
      timestamp: new Date()
    };
    setSupportMessages(prev => [...prev, userMsg]);
    setSupportInput('');
    handleFastResponse(supportInput, true);
  };

  // --- Tool List with Tooltips ---
  const hubTools = [
    { id: 'docs', icon: FileCheck, title: 'Doc Converter', color: 'bg-indigo-600', desc: 'PDF, Word, TXT', tooltip: 'Convert between Word, PDF, and Text formats instantly.' },
    { id: 'units', icon: Scale, title: 'Unit Master', color: 'bg-emerald-600', desc: 'Weight, Length, Temp', tooltip: 'Convert any unit of measure including weight, height, and currency.' },
    { id: 'tts', icon: Volume2, title: 'Text to Voice', color: 'bg-blue-500', desc: 'AI Narration', tooltip: 'Transform text into natural sounding human speech using AI.' },
    { id: 'story', icon: BookOpen, title: 'Story Gen', color: 'bg-purple-500', desc: 'Script Architect', tooltip: 'Generate scripts, stories, or professional copy from a few words.' },
    { id: 'logo', icon: PenTool, title: 'Logo Studio', color: 'bg-orange-500', desc: 'Vector Branding', tooltip: 'Design high-end corporate logos with "convertit.space" branding.' },
    { id: 'images', icon: ImageIcon, title: 'Visual AI', color: 'bg-pink-500', desc: 'DALL-E Style', tooltip: 'Create stunning visuals from detailed text descriptions.' },
  ];

  // --- Render Functions ---

  const renderConvertIt = () => (
    <div className="p-6 space-y-6">
      {!activeTool ? (
        <div className="space-y-6">
          <header className="space-y-1">
            <h1 className="text-3xl font-black text-white tracking-tight">ConvertIt Hub</h1>
            <p className="text-zinc-500 font-medium italic">Gemini Flash-Lite Powered Utility Suite</p>
          </header>

          <div className="grid grid-cols-2 gap-4">
            {hubTools.map((tool) => (
              <motion.button
                key={tool.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setActiveTool(tool.id as any); setOutput(''); setImageOutput(null); }}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2.5rem] flex flex-col items-start space-y-4 hover:bg-zinc-800 transition-colors group relative overflow-hidden"
                title={tool.tooltip}
              >
                <div className={`${tool.color} p-3 rounded-2xl group-hover:rotate-12 transition-transform`}>
                  <tool.icon className="text-white w-6 h-6" />
                </div>
                <div>
                  <span className="text-white font-bold text-sm block">{tool.title}</span>
                  <span className="text-zinc-500 text-[10px] uppercase font-black tracking-widest">{tool.desc}</span>
                </div>
                <Zap className="absolute -right-2 -bottom-2 w-12 h-12 text-white/5" />
              </motion.button>
            ))}
          </div>

          <div className="bg-gradient-to-br from-indigo-900/40 to-black p-8 rounded-[3rem] border border-indigo-500/20 relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <h3 className="text-indigo-400 font-black uppercase tracking-widest text-[10px]">Command Portal</h3>
              <h2 className="text-xl font-bold text-white">Full-Scale Processing</h2>
              <p className="text-zinc-400 text-xs">Access advanced text cleanup and data structuring with 0ms latency.</p>
              <button className="mt-4 bg-indigo-500 text-white px-6 py-2 rounded-full text-xs font-bold hover:bg-indigo-400">Launch Terminal</button>
            </div>
            <Sparkles className="absolute -right-4 -bottom-4 w-32 h-32 text-indigo-500/5 rotate-12" />
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          <button onClick={() => setActiveTool(null)} className="text-zinc-500 flex items-center space-x-2 text-sm group">
            <X className="w-4 h-4 group-hover:rotate-90 transition-transform" /> <span>Back to Hub</span>
          </button>
          
          <div className="bg-zinc-900/50 p-6 rounded-[2.5rem] border border-zinc-800 space-y-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white capitalize flex items-center space-x-2">
              <span>{activeTool.replace('_', ' ')}</span>
              <span className="bg-emerald-500/10 text-emerald-500 text-[8px] px-2 py-1 rounded-full border border-emerald-500/20 uppercase font-black tracking-widest">Flash-Lite Engine</span>
            </h2>

            {activeTool === 'units' && (
              <div className="grid grid-cols-2 gap-2">
                 <input type="text" placeholder="From (lb, m, usd)" className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white" value={unitFrom} onChange={(e) => setUnitFrom(e.target.value)} />
                 <input type="text" placeholder="To (kg, ft, eur)" className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white" value={unitTo} onChange={(e) => setUnitTo(e.target.value)} />
              </div>
            )}

            {activeTool === 'docs' && (
              <div className="grid grid-cols-2 gap-2">
                 <select className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white" value={docFrom} onChange={(e) => setDocFrom(e.target.value)}><option>Word</option><option>PDF</option><option>TXT</option><option>Markdown</option></select>
                 <select className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white" value={docTo} onChange={(e) => setDocTo(e.target.value)}><option>PDF</option><option>Word</option><option>TXT</option><option>Markdown</option></select>
              </div>
            )}

            <textarea
              className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none placeholder-zinc-700"
              rows={5}
              placeholder={hubTools.find(t => t.id === activeTool)?.tooltip}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            
            <button
              onClick={() => {
                if (activeTool === 'tts') handleTTS();
                else if (activeTool === 'logo') handleLogoGen();
                else if (activeTool === 'units') handleUnitConversion();
                else if (activeTool === 'docs') handleDocConversion();
                else if (activeTool === 'images') handleLogoGen();
                else handleStoryGen();
              }}
              disabled={isGenerating}
              className="w-full bg-white text-black font-black py-4 rounded-2xl flex items-center justify-center space-x-2 hover:bg-zinc-200 active:scale-[0.98] transition-all shadow-xl"
            >
              {isGenerating ? <Loader2 className="animate-spin w-5 h-5" /> : <Zap className="w-5 h-5 fill-black" />}
              <span>{isGenerating ? 'Processing...' : 'Run Automation'}</span>
            </button>
          </div>

          {output && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-zinc-900 border border-zinc-800 rounded-3xl text-sm leading-relaxed text-zinc-300 whitespace-pre-wrap font-mono shadow-inner">
              <div className="flex items-center space-x-2 mb-3 text-emerald-500">
                <FileCheck className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Engine Output</span>
              </div>
              {output}
            </motion.div>
          )}

          {imageOutput && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center">
              <div className="bg-white p-6 rounded-[2.5rem] shadow-2xl border-4 border-zinc-900">
                <img src={imageOutput} className="w-full max-w-xs rounded-2xl" alt="convertit.space AI Logo" />
                <div className="text-center mt-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Brand Identifier Generated</div>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );

  const renderDealCloser = () => (
    <div className="p-6 space-y-6 bg-black min-h-full pb-32">
      <header className="flex flex-col items-center space-y-4 pt-8 text-center relative">
        <div className="absolute top-0 right-0">
          <div className="bg-amber-500 text-black text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-tighter shadow-lg shadow-amber-500/20">Operational</div>
        </div>
        
        {brandLogo ? (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative group">
            <img src={brandLogo} className="w-36 h-36 rounded-[3rem] shadow-3xl shadow-amber-500/20 border-2 border-amber-500/50 p-2 bg-zinc-950" alt="convertit.space Logo" />
            <button 
              onClick={() => handleLogoGen("Ultra-luxury logo with 'convertit.space' text, gold embossed, carbon fiber background, cinematic lighting")}
              className="absolute -bottom-2 -right-2 bg-amber-500 p-3 rounded-full text-black shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
              title="Redesign Logo"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </motion.div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleLogoGen("Ultra-luxury logo with 'convertit.space' text, gold embossed, carbon fiber background, cinematic lighting")}
            disabled={isGenerating}
            className="w-36 h-36 bg-zinc-900 border-2 border-dashed border-amber-500/30 rounded-[3rem] flex flex-col items-center justify-center text-amber-500/50 hover:border-amber-500 hover:text-amber-500 transition-all shadow-inner relative group overflow-hidden"
            title="Design convertit.space Branding"
          >
            {isGenerating ? <Loader2 className="w-8 h-8 animate-spin" /> : (
              <>
                <PenTool className="w-8 h-8 mb-1" />
                <span className="text-[10px] font-black text-white/40 uppercase group-hover:text-amber-500 transition-colors">convertit.space</span>
                <span className="text-[8px] font-black uppercase tracking-widest mt-1">Design Branding</span>
              </>
            )}
          </motion.button>
        )}
        
        <div className="space-y-1">
          <h1 className="text-5xl font-black text-white tracking-tighter uppercase italic leading-none">Deal Closer</h1>
          <p className="text-amber-500 font-bold uppercase tracking-[0.4em] text-[10px]">AI Strategic Acquisition v2.5</p>
        </div>
      </header>

      {/* Statistics Section */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl flex flex-col items-center text-center">
          <PieChart className="w-5 h-5 text-amber-500 mb-2" />
          <span className="text-[9px] font-black text-zinc-500 uppercase">Valuation</span>
          <span className="text-white font-black">${(followUps.length * 4500).toLocaleString()}</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl flex flex-col items-center text-center">
          <Users className="w-5 h-5 text-emerald-500 mb-2" />
          <span className="text-[9px] font-black text-zinc-500 uppercase">Pipeline</span>
          <span className="text-white font-black">{leads.length}</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-3xl flex flex-col items-center text-center">
          <Clock className="w-5 h-5 text-indigo-500 mb-2" />
          <span className="text-[9px] font-black text-zinc-500 uppercase">Pending</span>
          <span className="text-white font-black">{followUps.filter(f => f.status === 'pending').length}</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type="text"
            className="w-full bg-zinc-900 border-2 border-zinc-800 rounded-[2rem] py-5 px-8 text-white text-sm focus:border-amber-500/50 outline-none shadow-2xl placeholder-zinc-700"
            placeholder="Search Global Business Entities..."
            value={leadQuery}
            onChange={(e) => setLeadQuery(e.target.value)}
          />
          <button 
            onClick={findLeads}
            disabled={isGenerating}
            className="absolute right-3 top-2 bg-amber-500 p-3 rounded-full hover:bg-amber-400 disabled:opacity-20 transition-all shadow-xl shadow-amber-500/30"
          >
            {isGenerating ? <Loader2 className="w-6 h-6 text-black animate-spin" /> : <Search className="w-6 h-6 text-black" />}
          </button>
        </div>

        {/* Lead results logic same as before but added tooltip concepts on buttons */}
        <div className="space-y-4">
          {leads.map((lead) => (
            <motion.div layout key={lead.id} className="bg-zinc-900/80 border border-zinc-800 p-6 rounded-[2.5rem] flex flex-col space-y-4 hover:border-amber-500/40 transition-colors shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20"><Briefcase className="w-6 h-6 text-amber-500" /></div>
                  <div>
                    <h4 className="text-white font-black">{lead.name}</h4>
                    <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">{lead.uri}</span>
                  </div>
                </div>
                <button onClick={() => startVoiceOutreach(lead.name)} className="p-3 bg-zinc-800 rounded-2xl text-zinc-400 hover:bg-amber-500 hover:text-black transition-all" title="Initiate Live AI Voice Outreach"><PhoneCall className="w-5 h-5" /></button>
              </div>
              <button onClick={() => setSchedulingLead(lead)} className="w-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black py-4 rounded-2xl text-xs uppercase tracking-[0.2em] flex items-center justify-center space-x-2 hover:bg-emerald-500 hover:text-black transition-all" title="Add this entity to the follow-up pipeline"><Plus className="w-4 h-4" /><span>Add to Pipeline</span></button>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSupport = () => (
    <div className="p-6 flex flex-col h-full space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight">Contact & Support</h1>
        <p className="text-zinc-500 font-medium italic">Automated 24/7 AI Assistance</p>
      </header>

      {/* Support Chat Interface */}
      <div className="flex-1 bg-zinc-900/50 border border-zinc-800 rounded-[3rem] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {supportMessages.map((msg) => (
            <motion.div 
              key={msg.id}
              initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[80%] p-5 rounded-[2rem] text-sm font-medium leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-zinc-800 text-zinc-300 rounded-tl-none'}`}>
                {msg.text}
                <div className={`text-[8px] mt-2 uppercase font-black tracking-widest ${msg.role === 'user' ? 'text-white/50' : 'text-zinc-500'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {msg.role === 'ai' ? 'Support Bot' : 'Client'}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="p-4 bg-zinc-950 border-t border-zinc-800 flex space-x-2">
          <input 
            type="text" 
            placeholder="Type your question..." 
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-full px-6 py-4 text-sm text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
            value={supportInput}
            onChange={(e) => setSupportInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendSupportChat()}
          />
          <button onClick={sendSupportChat} className="bg-indigo-600 text-white p-4 rounded-full hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 active:scale-95 transition-all"><Send className="w-5 h-5" /></button>
        </div>
      </div>

      {/* Official Contacts & Meet */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2.5rem] space-y-4">
          <div className="flex items-center space-x-3 text-emerald-400">
            <Mail className="w-5 h-5" />
            <h3 className="font-black text-xs uppercase tracking-widest">Official Email</h3>
          </div>
          <div className="space-y-1">
            <a href="mailto:contact@convertit.space" className="text-white text-xs font-bold block hover:underline">contact@convertit.space</a>
            <a href="mailto:info@convertit.space" className="text-zinc-500 text-xs font-bold block hover:underline">info@convertit.space</a>
          </div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2.5rem] space-y-4">
          <div className="flex items-center space-x-3 text-amber-400">
            <Video className="w-5 h-5" />
            <h3 className="font-black text-xs uppercase tracking-widest">Google Meet</h3>
          </div>
          <a href="mailto:convertitspace@gmail.com" className="text-white text-xs font-bold block truncate hover:underline">convertitspace@gmail.com</a>
          <span className="text-[8px] font-black text-zinc-600 uppercase">Consultations Available</span>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2.5rem] flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="bg-purple-500/10 p-3 rounded-2xl"><Sparkles className="w-6 h-6 text-purple-400" /></div>
          <div>
            <h4 className="text-white font-bold text-xs">Feedback & Improvements</h4>
            <p className="text-zinc-600 text-[10px] font-bold">Help us build convertit.space v3.0</p>
          </div>
        </div>
        <a href="mailto:carrer@convertit.space" className="bg-zinc-800 px-4 py-2 rounded-full text-zinc-300 font-black text-[10px] uppercase tracking-widest hover:bg-zinc-700">carrer@convertit.space</a>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="p-6 space-y-8 max-w-2xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-black text-white tracking-tight">Labs & Configuration</h1>
        <p className="text-zinc-500 font-medium italic">Advanced Strategic Controls</p>
      </header>

      <div className="space-y-6">
        {/* Same Settings Logic for Notifications/Sound */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 space-y-6">
          <div className="flex items-center space-x-3 mb-2">
            <SettingsIcon className="w-6 h-6 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">System Controls</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-900">
              <span className="text-xs font-black uppercase text-zinc-400 tracking-widest">Push Notifications</span>
              <button onClick={() => setNotificationsEnabled(!notificationsEnabled)} className={`w-12 h-6 rounded-full relative transition-all ${notificationsEnabled ? 'bg-indigo-600' : 'bg-zinc-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${notificationsEnabled ? 'left-7' : 'left-1'}`} /></button>
            </div>
            <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl border border-zinc-900">
              <span className="text-xs font-black uppercase text-zinc-400 tracking-widest">Audio Alerts</span>
              <button onClick={() => setSoundEnabled(!soundEnabled)} className={`w-12 h-6 rounded-full relative transition-all ${soundEnabled ? 'bg-amber-500' : 'bg-zinc-800'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${soundEnabled ? 'left-7' : 'left-1'}`} /></button>
            </div>
          </div>
        </section>

        {/* Social Network Section */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 space-y-6">
          <h2 className="text-xs font-black uppercase text-zinc-500 tracking-widest border-l-4 border-indigo-600 px-4">Follow the Ecosystem</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'x', icon: Twitter, label: 'X', handle: '@convertit' },
              { id: 'ig', icon: Instagram, label: 'IG', handle: '@convertit' },
              { id: 'tk', icon: Video, label: 'TikTok', handle: '@convertir' },
              { id: 'dc', icon: MessagesSquare, label: 'Discord', handle: '@convertit' },
              { id: 'fb', icon: Facebook, label: 'FB', handle: '@convertit' },
              { id: 'wa', icon: Phone, label: 'WhatsApp', handle: 'convertit' },
            ].map((soc) => (
              <motion.button key={soc.id} whileHover={{ y: -5 }} className="bg-black border border-zinc-800 p-4 rounded-3xl flex flex-col items-center space-y-2 group">
                <soc.icon className="w-6 h-6 text-zinc-600 group-hover:text-indigo-400 transition-colors" />
                <span className="text-[8px] font-black uppercase text-zinc-500 tracking-tighter">{soc.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        <footer className="text-center pb-10">
          <div className="text-[8px] font-black text-zinc-800 uppercase tracking-[1em]">convertit.space © 2025</div>
          <div className="text-zinc-700 text-[10px] mt-2 font-bold italic">Unlocking human potential through AI integration.</div>
        </footer>
      </div>
    </div>
  );

  return (
    <div className="h-[100dvh] bg-black text-zinc-300 font-sans selection:bg-indigo-500/30 overflow-hidden flex flex-col">
      <main className="flex-1 relative overflow-hidden overflow-y-auto no-scrollbar">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="h-full"
          >
            {activeSection === 'convertit' && renderConvertIt()}
            {activeSection === 'dealcloser' && renderDealCloser()}
            {activeSection === 'support' && renderSupport()}
            {activeSection === 'settings' && renderSettings()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Primary Navigation Bar */}
      <nav className="h-24 bg-zinc-950/80 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4 sticky bottom-0 z-50">
        <button 
          onClick={() => { setActiveSection('convertit'); setActiveTool(null); }}
          className={`flex flex-col items-center space-y-2 transition-all group ${activeSection === 'convertit' ? 'text-indigo-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
          title="Conversion & AI Tools Hub"
        >
          <Zap className={`w-7 h-7 ${activeSection === 'convertit' ? 'fill-indigo-400' : ''}`} />
          <span className="text-[8px] font-black uppercase tracking-widest">Hub</span>
        </button>

        <button 
          onClick={() => setActiveSection('support')}
          className={`flex flex-col items-center space-y-2 transition-all group ${activeSection === 'support' ? 'text-indigo-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
          title="Support & Contact Command Center"
        >
          <HelpCircle className={`w-7 h-7 ${activeSection === 'support' ? 'fill-indigo-400' : ''}`} />
          <span className="text-[8px] font-black uppercase tracking-widest">Support</span>
        </button>
        
        <div className="relative -top-10">
          <motion.button 
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => { setActiveSection('dealcloser'); }}
            className={`w-20 h-20 rounded-[2.2rem] flex items-center justify-center shadow-3xl transition-all border-4 ${activeSection === 'dealcloser' ? 'bg-amber-500 text-black border-black shadow-amber-500/30' : 'bg-zinc-800 text-zinc-400 border-zinc-900 shadow-xl'}`}
            title="Elite Deal Closer Command Center"
          >
            <Target className="w-10 h-10" />
          </motion.button>
        </div>

        <button 
          onClick={() => setActiveSection('settings')}
          className={`flex flex-col items-center space-y-2 transition-all group ${activeSection === 'settings' ? 'text-indigo-400 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}
          title="Labs & Strategic Configuration"
        >
          <SettingsIcon className="w-7 h-7" />
          <span className="text-[8px] font-black uppercase tracking-widest">Labs</span>
        </button>
      </nav>

      {/* Android Handle Indicator */}
      <div className="h-1.5 w-32 bg-zinc-800 rounded-full mx-auto mb-3 opacity-20 shrink-0" />

      {/* Scheduling Modal */}
      <AnimatePresence>
        {schedulingLead && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[200] flex items-end sm:items-center justify-center p-6"
          >
            <motion.div 
              initial={{ y: 100, scale: 0.95 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 100, scale: 0.95 }}
              className="w-full max-w-md bg-zinc-950 border-2 border-zinc-800 rounded-[3.5rem] p-10 space-y-8 shadow-3xl"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-white tracking-tighter italic">Schedule Pipeline</h3>
                  <p className="text-zinc-500 text-xs font-black uppercase tracking-widest mt-1">Acquiring {schedulingLead.name}</p>
                </div>
                <button onClick={() => setSchedulingLead(null)} className="p-3 bg-zinc-900 rounded-full text-zinc-500 group"><X className="w-6 h-6 group-hover:rotate-90 transition-transform" /></button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                   <button onClick={() => setFollowUpType('manual')} className={`p-5 rounded-[1.8rem] border-2 font-black text-[10px] uppercase tracking-widest transition-all ${followUpType === 'manual' ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}>Manual Task</button>
                   <button onClick={() => setFollowUpType('automated_call')} className={`p-5 rounded-[1.8rem] border-2 font-black text-[10px] uppercase tracking-widest transition-all ${followUpType === 'automated_call' ? 'bg-amber-500 text-black border-amber-500 shadow-lg shadow-amber-500/20' : 'bg-zinc-900 text-zinc-500 border-zinc-800'}`}>Auto-Voice</button>
                </div>
                <div className="space-y-4">
                   <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full bg-black border-2 border-zinc-900 rounded-[1.8rem] p-5 text-white outline-none focus:border-amber-500/50 font-black text-xs uppercase" />
                   <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className="w-full bg-black border-2 border-zinc-900 rounded-[1.8rem] p-5 text-white outline-none focus:border-amber-500/50 font-black text-xs uppercase" />
                </div>
              </div>

              <button 
                onClick={scheduleFollowUp}
                className="w-full bg-white text-black font-black py-6 rounded-[2.5rem] text-sm uppercase tracking-[0.4em] shadow-2xl hover:bg-amber-400 hover:scale-[1.02] transition-all active:scale-95"
              >
                Confirm Acquisition
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-bounce-subtle {
          animation: bounce-subtle 3s infinite ease-in-out;
        }
        input[type="date"]::-webkit-calendar-picker-indicator,
        input[type="time"]::-webkit-calendar-picker-indicator {
          filter: invert(1);
          padding: 10px;
          cursor: pointer;
        }
        select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 1.5rem center;
          background-size: 1.2em;
        }
      `}</style>
    </div>
  );
};

// Safe Initialization
const init = () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
