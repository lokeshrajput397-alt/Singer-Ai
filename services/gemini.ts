import { GoogleGenAI, Type, Modality } from "@google/genai";
import { SongAnalysis, GeneratedSong } from "../types";

// Helper to convert Blob to Base64
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove data:audio/xxx;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const analyzeVocalTrack = async (audioBlob: Blob): Promise<SongAnalysis> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });
  const base64Audio = await blobToBase64(audioBlob);

  const prompt = `
    You are a world-class music producer named "Singer Ai". 
    Listen to this audio recording. It might be a raw vocal track OR a full song.
    
    1. Transcribe the lyrics (if any).
    2. Estimate the BPM (Beats Per Minute).
    3. Identify the musical Key.
    4. Describe the sentiment/mood.
    5. Suggest a genre that fits this style.
    6. INSTRUMENT RECOGNITION: Identify and tag all musical instruments heard in the recording. Be specific (e.g., 'Distorted Electric Guitar', 'Bass Guitar', '808 Bass', 'Synth Lead', 'Acoustic Drums', 'Female Vocals').
    7. Write a short creative suggestion for a backing track or additional production.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: audioBlob.type || 'audio/webm', // Default to webm if blob type is empty (common in MediaRecorder)
              data: base64Audio
            }
          },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bpm: { type: Type.NUMBER },
            key: { type: Type.STRING },
            sentiment: { type: Type.STRING },
            genre: { type: Type.STRING },
            lyrics: { type: Type.STRING },
            suggestion: { type: Type.STRING },
            instruments: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["bpm", "key", "sentiment", "genre", "lyrics", "suggestion", "instruments"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as SongAnalysis;
  } catch (error) {
    console.error("Analysis Error:", error);
    throw error;
  }
};

export const generateBackingVocals = async (analysis: SongAnalysis): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");

  const ai = new GoogleGenAI({ apiKey });

  // We instruct the TTS model to "perform" a backing track using beatboxing and vocal bass
  // This simulates "adding music" within the capabilities of the model
  const textPrompt = `
    (Genre: ${analysis.genre}, Key: ${analysis.key}, Tempo: ${analysis.bpm} BPM, Mood: ${analysis.sentiment})
    Perform a rhythmic instrumental backing track using only your voice (Acapella style).
    
    CRITICAL INSTRUCTION:
    - Simulate a driving "Bass Guitar" line (deep vocal resonance).
    - Add "Electric Pop" style drum rhythms (beatbox).
    - Create a full, energetic arrangement.
    
    Do not speak words. Make musical sounds like "Dum dum kah tss...".
    Make it energetic and full.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: textPrompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' }, // Deep voice for bass/beatbox
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate audio");

    return base64Audio;

  } catch (error) {
    console.error("Generation Error:", error);
    throw error;
  }
};

// --- Suno-like Features ---

export const generateSongMetadata = async (prompt: string): Promise<GeneratedSong> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });

  const systemPrompt = `
    You are an expert songwriter and composer. Based on the user's topic, create a song structure.
    1. Create a catchy Title.
    2. Define a specific Genre (e.g., "Electric Pop", "Lo-fi Hip Hop", "Cyberpunk Synthwave", "Acoustic Folk").
    3. Define the Mood.
    4. Write short, catchy Lyrics (1 Verse, 1 Chorus).
    5. Write a short description of the song.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: {
      parts: [{ text: `User Prompt: ${prompt}\n\n${systemPrompt}` }]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          genre: { type: Type.STRING },
          mood: { type: Type.STRING },
          lyrics: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["title", "genre", "mood", "lyrics", "description"]
      }
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  return JSON.parse(text) as GeneratedSong;
};

export const generateSongPerformance = async (song: GeneratedSong): Promise<string> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key not found");
  const ai = new GoogleGenAI({ apiKey });

  const textPrompt = `
    Perform the following song in the style of ${song.genre}.
    Mood: ${song.mood}.
    
    LYRICS:
    ${song.lyrics}
    
    INSTRUCTIONS:
    - Perform this rhythmically. 
    - INCORPORATE "Electric Pop" energy.
    - Add a vocal "Bass Guitar" line underneath the vocals to drive the beat.
    - Add vocal percussion (beatboxing) between lines to keep the beat.
    - Be expressive.
    - If the genre is rap, rap it. If it's folk, recite it melodically.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: textPrompt }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, // Balanced voice
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Failed to generate audio");

  return base64Audio;
};
