import React, { useState, useRef, useEffect, useCallback } from 'react';
import Header from './components/Header';
import AudioVisualizer from './components/AudioVisualizer';
import AnalysisCard from './components/AnalysisCard';
import { Mic, Square, Play, Loader2, Music2, Volume2, Upload, FileAudio, Download, Sparkles, Mic2, Radio } from 'lucide-react';
import { AppState, SongAnalysis, GeneratedSong } from './types';
import { analyzeVocalTrack, generateBackingVocals, generateSongMetadata, generateSongPerformance } from './services/gemini';

// Helper to decode PCM from Gemini output
async function decodeAudioData(
  base64String: string,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const binaryString = atob(base64String);
  const len = binaryString.length;
  // Assuming Int16 little-endian PCM
  const int16Array = new Int16Array(len / 2);
  const view = new DataView(int16Array.buffer);
  
  for (let i = 0; i < len; i += 2) {
      // Convert string char codes to bytes, reconstruct Int16
      const low = binaryString.charCodeAt(i);
      const high = binaryString.charCodeAt(i + 1);
      // Little endian assumption
      int16Array[i/2] = (high << 8) | low;
  }

  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const buffer = ctx.createBuffer(numChannels, float32Array.length, sampleRate);
  buffer.copyToChannel(float32Array, 0);
  return buffer;
}

// Helper to convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this example)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for(i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < buffer.length) {
    for(i = 0; i < numOfChan; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true);          // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([bufferArr], {type: "audio/wav"});

  function setUint16(data: any) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: any) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

type TabMode = 'PRODUCER' | 'COMPOSER';

const App: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState<TabMode>('PRODUCER');
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  
  // Producer State
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SongAnalysis | null>(null);
  
  // Composer State
  const [promptInput, setPromptInput] = useState('');
  const [generatedSong, setGeneratedSong] = useState<GeneratedSong | null>(null);

  // Shared Audio State
  const [generatedAudioBuffer, setGeneratedAudioBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<AudioBufferSourceNode[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Audio Context safely
  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  // --- PRODUCER FUNCTIONS ---

  const startRecording = async () => {
    setError(null);
    setFileName("Vocal Recording");
    try {
      const audioCtx = initAudioContext();
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setStream(mediaStream);
      
      mediaRecorderRef.current = new MediaRecorder(mediaStream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStream(null);
        mediaStream.getTracks().forEach(track => track.stop());
        
        // Auto start analysis
        handleAnalysis(blob);
      };

      mediaRecorderRef.current.start();
      setAppState(AppState.RECORDING);

    } catch (err) {
      setError("Microphone access denied or not available.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && appState === AppState.RECORDING) {
      mediaRecorderRef.current.stop();
      setAppState(AppState.ANALYZING);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('audio/')) {
      setError("Please upload a valid audio file.");
      return;
    }

    setError(null);
    setFileName(file.name);
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
    setAppState(AppState.ANALYZING);
    
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    handleAnalysis(file);
  };

  const handleAnalysis = async (blob: Blob) => {
    try {
      const result = await analyzeVocalTrack(blob);
      setAnalysis(result);
      setAppState(AppState.GENERATING);
      await handleBackingGeneration(result);
    } catch (err) {
      setError("Failed to analyze audio. Please try again.");
      setAppState(AppState.IDLE);
    }
  };

  const handleBackingGeneration = async (analysisData: SongAnalysis) => {
    try {
      const base64Audio = await generateBackingVocals(analysisData);
      const ctx = initAudioContext();
      const buffer = await decodeAudioData(base64Audio, ctx, 24000, 1);
      setGeneratedAudioBuffer(buffer);
      setAppState(AppState.PLAYBACK);
    } catch (err) {
      setError("Failed to generate backing track.");
      setAppState(AppState.PLAYBACK);
    }
  };

  // --- COMPOSER FUNCTIONS ---

  const handleSongGeneration = async () => {
    if (!promptInput.trim()) {
      setError("Please enter a song description.");
      return;
    }
    setError(null);
    setAppState(AppState.ANALYZING); // Reusing generic "busy" states
    
    try {
      // 1. Metadata
      const metadata = await generateSongMetadata(promptInput);
      setGeneratedSong(metadata);
      setAppState(AppState.GENERATING);

      // 2. Audio
      const base64Audio = await generateSongPerformance(metadata);
      const ctx = initAudioContext();
      const buffer = await decodeAudioData(base64Audio, ctx, 24000, 1);
      setGeneratedAudioBuffer(buffer);
      setAppState(AppState.PLAYBACK);
      setFileName(metadata.title); // For download

    } catch (e) {
      console.error(e);
      setError("Failed to compose song. Try a different prompt.");
      setAppState(AppState.IDLE);
    }
  };

  // --- SHARED PLAYBACK ---

  const playAudio = async () => {
    const ctx = initAudioContext();
    
    // Stop any currently playing
    sourceNodesRef.current.forEach(node => {
        try { node.stop(); } catch (e) {}
    });
    sourceNodesRef.current = [];

    if (activeTab === 'PRODUCER') {
        // Play User Audio
        if (audioBlob) {
            const arrayBuffer = await audioBlob.arrayBuffer();
            const userAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
            const userSource = ctx.createBufferSource();
            userSource.buffer = userAudioBuffer;
            userSource.connect(ctx.destination);
            userSource.start(0);
            sourceNodesRef.current.push(userSource);
        }
        // Play Generated Backing
        if (generatedAudioBuffer) {
            const aiSource = ctx.createBufferSource();
            aiSource.buffer = generatedAudioBuffer;
            const gainNode = ctx.createGain();
            gainNode.gain.value = 0.8;
            aiSource.connect(gainNode);
            gainNode.connect(ctx.destination);
            aiSource.start(0);
            sourceNodesRef.current.push(aiSource);
        }
    } else {
        // COMPOSER MODE: Just play the generated result
         if (generatedAudioBuffer) {
            const aiSource = ctx.createBufferSource();
            aiSource.buffer = generatedAudioBuffer;
            aiSource.connect(ctx.destination);
            aiSource.start(0);
            sourceNodesRef.current.push(aiSource);
        }
    }
  };

  const downloadMix = async () => {
    if (!generatedAudioBuffer) return;
    setIsDownloading(true);

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      let finalBuffer: AudioBuffer;

      if (activeTab === 'PRODUCER' && audioBlob) {
         // Mix Logic
         const userArrayBuffer = await audioBlob.arrayBuffer();
         const userAudioBuffer = await ctx.decodeAudioData(userArrayBuffer);
         const length = Math.max(userAudioBuffer.length, generatedAudioBuffer.length);
         
         const offlineCtx = new OfflineAudioContext(2, length, ctx.sampleRate);
         
         const userSource = offlineCtx.createBufferSource();
         userSource.buffer = userAudioBuffer;
         userSource.connect(offlineCtx.destination);
         userSource.start(0);

         const aiSource = offlineCtx.createBufferSource();
         aiSource.buffer = generatedAudioBuffer;
         const aiGain = offlineCtx.createGain();
         aiGain.gain.value = 0.8;
         aiSource.connect(aiGain);
         aiGain.connect(offlineCtx.destination);
         aiSource.start(0);

         finalBuffer = await offlineCtx.startRendering();
      } else {
         // Just the generated file
         finalBuffer = generatedAudioBuffer;
      }
      
      const wavBlob = audioBufferToWav(finalBuffer);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      const name = fileName ? fileName.replace(/\.[^/.]+$/, "") : "song";
      a.href = url;
      a.download = `Singer_Ai_${name}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (e) {
      console.error("Error creating mix download:", e);
      setError("Failed to create download file.");
    } finally {
      setIsDownloading(false);
    }
  };

  const reset = () => {
    setAppState(AppState.IDLE);
    setAudioBlob(null);
    setAudioUrl(null);
    setAnalysis(null);
    setGeneratedAudioBuffer(null);
    setGeneratedSong(null);
    setFileName(null);
    setError(null);
    setIsDownloading(false);
    
    sourceNodesRef.current.forEach(node => {
      try { node.stop(); } catch (e) {}
    });
    sourceNodesRef.current = [];
  };

  const toggleTab = (tab: TabMode) => {
      if (appState !== AppState.IDLE && appState !== AppState.PLAYBACK) return; 
      reset();
      setActiveTab(tab);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20">
      <Header />

      <main className="container mx-auto px-4 pt-24 max-w-4xl">
        
        {/* Tab Switcher */}
        <div className="flex justify-center mb-8">
            <div className="bg-slate-900 p-1 rounded-xl border border-white/10 inline-flex">
                <button 
                    onClick={() => toggleTab('PRODUCER')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'PRODUCER' ? 'bg-brand-600 text-white shadow-lg shadow-brand-900/50' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Mic2 className="w-4 h-4" />
                    Vocal Producer
                </button>
                <button 
                    onClick={() => toggleTab('COMPOSER')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'COMPOSER' ? 'bg-accent-600 text-white shadow-lg shadow-accent-900/50' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    <Sparkles className="w-4 h-4" />
                    AI Composer
                </button>
            </div>
        </div>

        {/* Header Text */}
        <div className="text-center mb-8 space-y-4">
            <h2 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-b from-white to-slate-500">
              {appState === AppState.IDLE && (activeTab === 'PRODUCER' ? "Start Your Production" : "Create a Song from Text")}
              {appState === AppState.RECORDING && "Listening..."}
              {appState === AppState.ANALYZING && (activeTab === 'PRODUCER' ? "Analyzing Audio..." : "Composing Lyrics & Structure...")}
              {appState === AppState.GENERATING && "Synthesizing Audio..."}
              {appState === AppState.PLAYBACK && "Track Ready"}
            </h2>
        </div>

        {/* ACTIVE TAB: PRODUCER */}
        {activeTab === 'PRODUCER' && (
            <>
                <div className="relative w-full h-64 bg-slate-900 rounded-3xl border border-white/10 overflow-hidden shadow-2xl shadow-black/50 mb-8 group">
                    <div className="absolute inset-0 z-0">
                        <AudioVisualizer 
                            stream={stream} 
                            audioContext={audioContextRef.current} 
                            isActive={appState === AppState.RECORDING}
                        />
                        {appState !== AppState.RECORDING && (
                            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900/20" />
                        )}
                    </div>

                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 p-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-2 rounded-lg text-sm mb-4">
                                {error}
                            </div>
                        )}

                        {appState === AppState.IDLE && (
                        <div className="flex items-center gap-8">
                            <button 
                            onClick={startRecording}
                            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 transition-all shadow-lg shadow-red-500/30 hover:scale-105"
                            >
                            <Mic className="w-8 h-8 text-white fill-current" />
                            </button>
                            
                            <div className="w-px h-16 bg-white/10 mx-2"></div>

                            <div className="relative">
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept="audio/*"
                                className="hidden" 
                                id="audio-upload"
                            />
                            <label 
                                htmlFor="audio-upload"
                                className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 border border-white/10 hover:bg-slate-700 transition-all cursor-pointer hover:scale-105"
                            >
                                <Upload className="w-6 h-6 text-slate-300 group-hover:text-white" />
                            </label>
                            </div>
                        </div>
                        )}

                        {appState === AppState.RECORDING && (
                        <button 
                            onClick={stopRecording}
                            className="group relative flex items-center justify-center w-20 h-20 rounded-full bg-slate-800 hover:bg-slate-700 border-2 border-red-500/50 transition-all shadow-lg animate-pulse"
                        >
                            <Square className="w-8 h-8 text-red-500 fill-current" />
                        </button>
                        )}

                        {(appState === AppState.ANALYZING || appState === AppState.GENERATING) && (
                            <div className="flex flex-col items-center">
                                <Loader2 className="w-12 h-12 text-brand-500 animate-spin mb-4" />
                            </div>
                        )}

                        {appState === AppState.PLAYBACK && (
                            <div className="flex items-center gap-6">
                                <button onClick={reset} className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-all">
                                    New
                                </button>
                                <button onClick={playAudio} className="flex items-center gap-2 px-8 py-3 rounded-full bg-brand-600 hover:bg-brand-500 text-white shadow-lg shadow-brand-600/30 transition-all hover:scale-105">
                                    <Play className="w-5 h-5 fill-current" /> Play Mix
                                </button>
                                <button onClick={downloadMix} disabled={isDownloading} className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 transition-all">
                                    {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                
                {(appState === AppState.PLAYBACK || appState === AppState.GENERATING || appState === AppState.ANALYZING) && (
                    <AnalysisCard analysis={analysis} loading={appState === AppState.ANALYZING} />
                )}
            </>
        )}

        {/* ACTIVE TAB: COMPOSER */}
        {activeTab === 'COMPOSER' && (
            <>
               {appState === AppState.IDLE && (
                   <div className="max-w-2xl mx-auto bg-slate-900 border border-white/10 rounded-2xl p-8 shadow-xl">
                       <label className="block text-sm font-medium text-slate-400 mb-3">
                           Describe the song you want to create
                       </label>
                       <textarea 
                            value={promptInput}
                            onChange={(e) => setPromptInput(e.target.value)}
                            placeholder="E.g., A melancholic song about a robot learning to love in a rainy cyberpunk city. Low-fi hip hop style."
                            className="w-full h-32 bg-black/30 border border-white/10 rounded-xl p-4 text-slate-100 focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none resize-none placeholder:text-slate-600 mb-6"
                       />
                       <button 
                            onClick={handleSongGeneration}
                            className="w-full py-4 bg-gradient-to-r from-accent-600 to-brand-600 rounded-xl font-bold text-white shadow-lg shadow-accent-600/20 hover:shadow-accent-600/40 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                       >
                           <Sparkles className="w-5 h-5" />
                           Generate Song
                       </button>
                   </div>
               )}

                {(appState === AppState.ANALYZING || appState === AppState.GENERATING) && (
                    <div className="h-64 flex flex-col items-center justify-center">
                        <Loader2 className="w-16 h-16 text-accent-500 animate-spin mb-6" />
                        <p className="text-accent-300 animate-pulse text-lg font-medium">
                            {appState === AppState.ANALYZING ? "Writing Lyrics & Composing..." : "Recording Vocals..."}
                        </p>
                    </div>
                )}

               {appState === AppState.PLAYBACK && generatedSong && (
                   <div className="grid md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-8">
                       {/* Cover / Player Side */}
                       <div className="space-y-6">
                            <div className="aspect-square rounded-2xl bg-gradient-to-br from-accent-900 to-slate-900 border border-white/10 flex flex-col items-center justify-center p-8 text-center shadow-2xl relative overflow-hidden group">
                                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=1000&auto=format&fit=crop')] bg-cover opacity-20 mix-blend-overlay"></div>
                                <div className="relative z-10">
                                    <div className="w-20 h-20 bg-accent-500/20 rounded-full flex items-center justify-center mx-auto mb-6 backdrop-blur-sm border border-accent-500/30">
                                        <Radio className="w-10 h-10 text-accent-400" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-2">{generatedSong.title}</h3>
                                    <p className="text-accent-300 text-sm font-medium uppercase tracking-wider">{generatedSong.genre}</p>
                                </div>
                            </div>

                            <div className="flex gap-4">
                                <button 
                                    onClick={playAudio}
                                    className="flex-1 py-4 bg-white text-slate-900 rounded-xl font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Play className="w-5 h-5 fill-current" /> Play Track
                                </button>
                                <button 
                                    onClick={downloadMix}
                                    disabled={isDownloading}
                                    className="px-6 py-4 bg-slate-800 border border-white/10 rounded-xl hover:bg-slate-700 transition-colors text-white"
                                >
                                    {isDownloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                </button>
                                <button 
                                    onClick={reset}
                                    className="px-6 py-4 bg-slate-800 border border-white/10 rounded-xl hover:bg-slate-700 transition-colors text-white"
                                >
                                    New
                                </button>
                            </div>
                            
                            <div className="bg-slate-900/50 border border-white/10 rounded-xl p-4">
                                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-2">About this track</p>
                                <p className="text-slate-300 text-sm leading-relaxed">{generatedSong.description}</p>
                            </div>
                       </div>

                       {/* Lyrics Side */}
                       <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-8 backdrop-blur-sm h-[600px] overflow-y-auto shadow-xl custom-scrollbar">
                           <div className="flex items-center justify-between mb-6">
                                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                                    <FileAudio className="w-5 h-5 text-accent-500" />
                                    Lyrics
                                </h4>
                                <span className="text-xs bg-white/5 px-2 py-1 rounded text-slate-400 border border-white/5">AI Generated</span>
                           </div>
                           <div className="space-y-6 text-lg text-slate-300 font-serif leading-loose whitespace-pre-line">
                               {generatedSong.lyrics}
                           </div>
                       </div>
                   </div>
               )}
            </>
        )}

      </main>
    </div>
  );
};

export default App;