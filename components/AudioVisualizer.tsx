import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
  audioContext: AudioContext | null;
  isActive: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ stream, audioContext, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!stream || !audioContext || !isActive) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // Create source only if it doesn't exist for this stream to avoid errors
    try {
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;
    } catch (e) {
      console.warn("Source already connected or invalid stream", e);
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Draw visualizer bars
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 1.5; // Scale down height

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#0ea5e9'); // Brand 500
        gradient.addColorStop(1, '#8b5cf6'); // Accent 500

        ctx.fillStyle = gradient;
        
        // Rounded tops
        ctx.beginPath();
        ctx.roundRect(x, height - barHeight, barWidth, barHeight, [4, 4, 0, 0]);
        ctx.fill();

        x += barWidth + 2; // Spacing
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sourceRef.current) sourceRef.current.disconnect(); 
      // Do not close context here, it's shared
    };
  }, [stream, audioContext, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={150} 
      className="w-full h-full object-cover rounded-xl opacity-90"
    />
  );
};

export default AudioVisualizer;