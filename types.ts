export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  GENERATING = 'GENERATING',
  PLAYBACK = 'PLAYBACK',
  ERROR = 'ERROR'
}

export interface SongAnalysis {
  bpm: number;
  key: string;
  sentiment: string;
  genre: string;
  lyrics: string;
  suggestion: string;
  instruments: string[];
}

export interface GeneratedSong {
  title: string;
  genre: string;
  mood: string;
  lyrics: string;
  description: string;
}

export interface TrackLayer {
  id: string;
  name: string;
  type: 'vocal' | 'backing' | 'harmony';
  audioUrl: string;
  volume: number;
  muted: boolean;
}

export interface AudioContextState {
  context: AudioContext | null;
  isReady: boolean;
}